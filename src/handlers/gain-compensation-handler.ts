import EventEmitter from 'events'
import osc, { OscMessage } from 'osc'
import { CompanionVariableValues } from '@companion-module/base'
import { ModelSpec } from '../models/types.js'
import { ModuleLogger } from './logger.js'
import { ChannelCommands } from '../commands/channel.js'

// OSC path regexes for channel gain mirror and trim
const RE_GAIN = /^\/ch\/(\d+)\/in\/set\/\$g$/
const RE_TRIM = /^\/ch\/(\d+)\/in\/set\/trim$/

const TRIM_MIN = -18
const TRIM_MAX = 18
const TRIM_TOLERANCE = 0.05 // dB — within this = "ok"
const COMP_DEBOUNCE_MS = 200 // debounce per channel before applying compensation
const COMP_GUARD_MS = 500 // ignore stale /*S pushes for this long after writing trim
const SWEEP_MS = 5000 // fallback reconciliation interval

interface ChannelRef {
	gain: number // actual dB captured at snapshot time
	trim: number // actual dB captured at snapshot time
}

export class GainCompensationHandler extends EventEmitter {
	private enabled = false
	private mode: 'auto' | 'manual' = 'auto'
	private refs = new Map<number, ChannelRef>()

	// Actual-dB cache — only populated from full query responses (args[0].type === 's')
	// Never overwritten by /*S pushes (which carry normalized 0..1 floats)
	private gainCache = new Map<number, number>()
	private trimCache = new Map<number, number>()

	private snapshotTakenAt?: Date
	private snapshotTimer?: NodeJS.Timeout

	// Guard: channels where we just wrote trim — ignore stale /*S pushes
	private pendingSet = new Set<number>()
	private pendingSetTimers = new Map<number, NodeJS.Timeout>()

	// Debounce per channel for reactive auto-compensation
	private compDebounce = new Map<number, NodeJS.Timeout>()

	// Fallback reconciliation sweep
	private sweepTimer?: NodeJS.Timeout

	constructor(
		private readonly model: ModelSpec,
		private readonly logger?: ModuleLogger,
	) {
		super()
	}

	// ─── Message processing ───────────────────────────────────────────────────

	processMessage(msgs: Set<OscMessage>): void {
		for (const msg of msgs) {
			const args = msg.args as osc.MetaArgument[]

			const gainMatch = msg.address.match(RE_GAIN)
			if (gainMatch) {
				const ch = parseInt(gainMatch[1])
				if (args[0]?.type === 's') {
					// Full query response — args[0] is display string, parse to actual dB
					const db = parseFloat(args[0].value)
					if (!isNaN(db)) {
						this.gainCache.set(ch, db)
						this.emitChannelVariables(ch)
					}
				} else {
					// /*S push (normalized float) — react immediately if auto-comp is armed
					if (this.enabled && this.mode === 'auto' && this.refs.has(ch) && !this.pendingSet.has(ch)) {
						// Request fresh actual-dB value, then apply after debounce
						this.emit('ensure-loaded', ChannelCommands.InputGain(ch))
						this.scheduleAutoComp(ch)
					}
				}
				continue
			}

			const trimMatch = msg.address.match(RE_TRIM)
			if (trimMatch) {
				const ch = parseInt(trimMatch[1])
				if (args[0]?.type === 's') {
					const db = parseFloat(args[0].value)
					if (!isNaN(db)) {
						this.trimCache.set(ch, db)
						this.emitChannelVariables(ch)
					}
				}
			}
		}
	}

	// ─── Public API (called by actions) ──────────────────────────────────────

	takeSnapshot(): void {
		if (this.snapshotTimer) clearTimeout(this.snapshotTimer)
		// Request fresh values for all channels — responses update the caches via processMessage
		for (let ch = 1; ch <= this.model.channels; ch++) {
			this.emit('ensure-loaded', ChannelCommands.InputGain(ch))
			this.emit('ensure-loaded', ChannelCommands.InputTrim(ch))
		}
		// Capture refs after responses have had time to arrive
		this.snapshotTimer = setTimeout(() => this.captureRefs(), 2000)
	}

	enable(mode: 'auto' | 'manual'): void {
		this.enabled = true
		this.mode = mode
		if (mode === 'auto') {
			this.startSweep()
		} else {
			this.stopSweep()
		}
		this.emitGlobalVariables()
		this.emit('check-feedbacks', ['gain-comp-active', 'gain-comp-manual-active'])
	}

	disable(): void {
		this.enabled = false
		this.stopSweep()
		this.clearCompDebounces()
		this.emitGlobalVariables()
		this.emit('check-feedbacks', ['gain-comp-active', 'gain-comp-manual-active'])
	}

	compensateChannel(ch: number): void {
		if (!this.refs.has(ch)) return
		// Get fresh values then apply
		this.emit('ensure-loaded', ChannelCommands.InputGain(ch))
		this.emit('ensure-loaded', ChannelCommands.InputTrim(ch))
		setTimeout(() => this.applyCompensationForChannel(ch), 300)
	}

	// ─── State accessors (used by feedbacks) ─────────────────────────────────

	isEnabled(): boolean {
		return this.enabled
	}
	getMode(): 'auto' | 'manual' {
		return this.mode
	}
	hasSnapshot(): boolean {
		return this.snapshotTakenAt !== undefined
	}

	isChannelCompOk(ch: number): boolean {
		const ref = this.refs.get(ch)
		if (!ref) return true
		const currentGain = this.gainCache.get(ch)
		const currentTrim = this.trimCache.get(ch)
		if (currentGain === undefined || currentTrim === undefined) return true
		const expectedTrim = Math.max(TRIM_MIN, Math.min(TRIM_MAX, ref.trim - (currentGain - ref.gain)))
		return Math.abs(currentTrim - expectedTrim) <= TRIM_TOLERANCE
	}

	getCompDelta(ch: number): number | undefined {
		const ref = this.refs.get(ch)
		if (!ref) return undefined
		const currentGain = this.gainCache.get(ch)
		if (currentGain === undefined) return undefined
		return currentGain - ref.gain
	}

	destroy(): void {
		this.stopSweep()
		this.clearCompDebounces()
		this.clearPendingSetTimers()
		if (this.snapshotTimer) clearTimeout(this.snapshotTimer)
	}

	// ─── Internal ─────────────────────────────────────────────────────────────

	private captureRefs(): void {
		let count = 0
		for (let ch = 1; ch <= this.model.channels; ch++) {
			const gain = this.gainCache.get(ch)
			if (gain !== undefined) {
				this.refs.set(ch, { gain, trim: this.trimCache.get(ch) ?? 0 })
				count++
			}
		}
		this.snapshotTakenAt = new Date()
		this.logger?.info(`GainComp: snapshot captured for ${count}/${this.model.channels} channels`)
		this.emitGlobalVariables()
		this.emit('check-feedbacks', ['gain-comp-snapshot-exists'])
	}

	private scheduleAutoComp(ch: number): void {
		const existing = this.compDebounce.get(ch)
		if (existing) clearTimeout(existing)
		this.compDebounce.set(
			ch,
			setTimeout(() => {
				this.compDebounce.delete(ch)
				this.applyCompensationForChannel(ch)
			}, COMP_DEBOUNCE_MS),
		)
	}

	private applyCompensationForChannel(ch: number): void {
		const ref = this.refs.get(ch)
		if (!ref) return
		const currentGain = this.gainCache.get(ch)
		if (currentGain === undefined) {
			this.logger?.warn(`GainComp: no gain in cache for ch${ch}, skipping`)
			return
		}
		const delta = currentGain - ref.gain
		if (Math.abs(delta) < 0.01) return // no meaningful change
		const newTrim = Math.max(TRIM_MIN, Math.min(TRIM_MAX, ref.trim - delta))

		this.setPendingSet(ch)
		this.trimCache.set(ch, newTrim)
		this.emit('send', ChannelCommands.InputTrim(ch), newTrim)
		this.logger?.debug(`GainComp: ch${ch} Δgain=${delta.toFixed(2)}dB → trim=${newTrim.toFixed(2)}dB`)
		this.emitChannelVariables(ch)
		this.emit('check-feedbacks', ['channel-needs-comp'])
	}

	private setPendingSet(ch: number): void {
		this.pendingSet.add(ch)
		const existing = this.pendingSetTimers.get(ch)
		if (existing) clearTimeout(existing)
		this.pendingSetTimers.set(
			ch,
			setTimeout(() => {
				this.pendingSet.delete(ch)
				this.pendingSetTimers.delete(ch)
			}, COMP_GUARD_MS),
		)
	}

	// Fallback sweep: reconcile any drift that reactive updates missed (e.g. lost packets)
	private startSweep(): void {
		this.stopSweep()
		this.sweepTimer = setInterval(() => {
			if (!this.enabled || this.mode !== 'auto') return
			for (let ch = 1; ch <= this.model.channels; ch++) {
				if (!this.refs.has(ch) || this.pendingSet.has(ch)) continue
				if (!this.isChannelCompOk(ch)) {
					this.logger?.debug(`GainComp sweep: ch${ch} needs correction`)
					this.applyCompensationForChannel(ch)
				}
			}
		}, SWEEP_MS)
	}

	private stopSweep(): void {
		if (this.sweepTimer) {
			clearInterval(this.sweepTimer)
			this.sweepTimer = undefined
		}
	}

	private clearCompDebounces(): void {
		for (const t of this.compDebounce.values()) clearTimeout(t)
		this.compDebounce.clear()
	}

	private clearPendingSetTimers(): void {
		for (const t of this.pendingSetTimers.values()) clearTimeout(t)
		this.pendingSetTimers.clear()
		this.pendingSet.clear()
	}

	private emitGlobalVariables(): void {
		const vars: CompanionVariableValues = {
			comp_enabled: this.enabled ? 1 : 0,
			comp_mode: this.mode,
			comp_snapshot_time: this.snapshotTakenAt?.toLocaleTimeString() ?? '',
		}
		for (let ch = 1; ch <= this.model.channels; ch++) {
			this.addChannelVars(ch, vars)
		}
		this.emit('update-variables', vars)
	}

	private emitChannelVariables(ch: number): void {
		const vars: CompanionVariableValues = {}
		this.addChannelVars(ch, vars)
		this.emit('update-variables', vars)
	}

	private addChannelVars(ch: number, vars: CompanionVariableValues): void {
		const delta = this.getCompDelta(ch)
		vars[`ch${ch}_comp_delta`] = delta !== undefined ? (delta >= 0 ? '+' : '') + delta.toFixed(1) : ''
		vars[`ch${ch}_trim_ok`] = this.isChannelCompOk(ch) ? 1 : 0
	}
}
