import EventEmitter from 'events'
import osc, { OscMessage } from 'osc'
import { CompanionVariableValues } from '@companion-module/base'
import { ModelSpec } from '../models/types.js'
import { ModuleLogger } from './logger.js'
import { ChannelCommands } from '../commands/channel.js'

const RE_GAIN = /^\/ch\/(\d+)\/in\/set\/\$g$/
const RE_TRIM = /^\/ch\/(\d+)\/in\/set\/trim$/

// Wing LCL/AES50 preamp: normalized 0..1 maps to -3..45.5 dB (98 steps)
const GAIN_NORM_MIN = -3
const GAIN_NORM_RANGE = 48.5

// Trim: normalized 0..1 maps to -18..18 dB
const TRIM_NORM_MIN = -18
const TRIM_NORM_RANGE = 36

const TRIM_MIN = -18
const TRIM_MAX = 18
const TRIM_TOLERANCE = 0.05
const COMP_DEBOUNCE_MS = 300
const COMP_GUARD_MS = 600
const SWEEP_MS = 5000

interface ChannelRef {
	gain: number // actual dB
	trim: number // actual dB
}

/**
 * Convert any Wing OSC arg to actual dB for /ch/N/in/set/$g.
 * Wing sends either:
 *   - `,sff "5.5" 0.42 5.5`  (display string + normalized + actual) — full query response
 *   - `,f 0.42`               (normalized 0..1 only) — /*S push or minimal response
 * Accept both; convert normalized values using the known preamp range.
 */
function toGainDb(arg: osc.MetaArgument): number | undefined {
	if (!arg) return undefined
	if (arg.type === 's') {
		const v = parseFloat(arg.value)
		return isNaN(v) ? undefined : v
	}
	const raw = arg.value as number
	if (typeof raw !== 'number' || isNaN(raw)) return undefined
	// Normalized values are in [0, 1]; actual dB for LCL/AES50 preamps is −3..45.5.
	// Values outside [0, 1] are already in actual dB.
	if (raw >= 0 && raw <= 1) return raw * GAIN_NORM_RANGE + GAIN_NORM_MIN
	return raw
}

function toTrimDb(arg: osc.MetaArgument): number | undefined {
	if (!arg) return undefined
	if (arg.type === 's') {
		const v = parseFloat(arg.value)
		return isNaN(v) ? undefined : v
	}
	const raw = arg.value as number
	if (typeof raw !== 'number' || isNaN(raw)) return undefined
	// Trim range is −18..18 dB normalized to 0..1.
	// If value is outside [0, 1], it's already actual dB.
	if (raw >= 0 && raw <= 1) return raw * TRIM_NORM_RANGE + TRIM_NORM_MIN
	return raw
}

export class GainCompensationHandler extends EventEmitter {
	private enabled = false
	private mode: 'auto' | 'manual' = 'auto'
	private refs = new Map<number, ChannelRef>()
	private gainCache = new Map<number, number>()
	private trimCache = new Map<number, number>()
	private snapshotTakenAt?: Date
	private snapshotTimer?: NodeJS.Timeout
	private pendingSet = new Set<number>()
	private pendingSetTimers = new Map<number, NodeJS.Timeout>()
	private compDebounce = new Map<number, NodeJS.Timeout>()
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
				const db = toGainDb(args[0])
				if (db !== undefined) {
					this.gainCache.set(ch, db)
					this.emitChannelVariables(ch)
					// If auto comp is armed, schedule correction using the fresh value
					if (this.enabled && this.mode === 'auto' && this.refs.has(ch) && !this.pendingSet.has(ch)) {
						this.scheduleAutoComp(ch)
					}
				}
				continue
			}

			const trimMatch = msg.address.match(RE_TRIM)
			if (trimMatch) {
				const ch = parseInt(trimMatch[1])
				const db = toTrimDb(args[0])
				if (db !== undefined) {
					this.trimCache.set(ch, db)
					this.emitChannelVariables(ch)
				}
			}
		}
	}

	// ─── Public API ───────────────────────────────────────────────────────────

	takeSnapshot(): void {
		if (this.snapshotTimer) clearTimeout(this.snapshotTimer)
		// Request fresh values; responses will feed processMessage → gainCache/trimCache
		for (let ch = 1; ch <= this.model.channels; ch++) {
			this.emit('ensure-loaded', ChannelCommands.InputGain(ch))
			this.emit('ensure-loaded', ChannelCommands.InputTrim(ch))
		}
		// Give the Wing time to respond — with concurrency 100 this is well within 1 s
		this.snapshotTimer = setTimeout(() => this.captureRefs(), 1500)
	}

	enable(mode: 'auto' | 'manual'): void {
		this.enabled = true
		this.mode = mode
		if (mode === 'auto') this.startSweep()
		else this.stopSweep()
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
		this.emit('ensure-loaded', ChannelCommands.InputGain(ch))
		this.emit('ensure-loaded', ChannelCommands.InputTrim(ch))
		setTimeout(() => this.applyCompensationForChannel(ch), 400)
	}

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
		const g = this.gainCache.get(ch)
		return g !== undefined ? g - ref.gain : undefined
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
		this.logger?.info(`GainComp: snapshot captured ${count}/${this.model.channels} channels`)
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
			this.logger?.warn(`GainComp: no gain cached for ch${ch}, skipping`)
			return
		}
		const delta = currentGain - ref.gain
		if (Math.abs(delta) < 0.01) return
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
		for (let ch = 1; ch <= this.model.channels; ch++) this.addChannelVars(ch, vars)
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
