import EventEmitter from 'events'
import osc, { OscMessage } from 'osc'
import { CompanionVariableValues } from '@companion-module/base'
import { ModelSpec } from '../models/types.js'
import { ModuleLogger } from './logger.js'
import { ChannelCommands } from '../commands/channel.js'

const RE_GAIN = /^\/ch\/(\d+)\/in\/set\/\$g$/
const RE_TRIM = /^\/ch\/(\d+)\/in\/set\/trim$/

const TRIM_MIN = -18
const TRIM_MAX = 18
const TRIM_TOLERANCE = 0.05
const SWEEP_MS = 5000

interface ChannelRef {
	gain: number
	trim: number
}

/**
 * Extract the actual-dB value from an OSC message's args array.
 *
 * Wing response format:
 *   Full query (3 args): [display_string:s, normalized:f, actual_dB:f]
 *   /*S push  (1 arg) : [actual_dB:f]   ← Wing sends actual dB, NOT normalized
 *
 * Matches the reference osc-gain-compensation extractValue() implementation.
 */
function extractValue(args: osc.MetaArgument[]): number | null {
	if (args.length === 0) return null
	// For 3-arg full query responses, use args[2] (actual value).
	// For single-value /*S pushes, use args[0] directly.
	const raw = args.length >= 3 ? args[2].value : args[0].value
	if (typeof raw === 'number' && !isNaN(raw)) return raw
	if (typeof raw === 'string') {
		const n = parseFloat(raw)
		return isNaN(n) ? null : n
	}
	return null
}

export class GainCompensationHandler extends EventEmitter {
	private enabled = false
	private mode: 'auto' | 'manual' = 'auto'
	private refs = new Map<number, ChannelRef>()

	// Current observed values — actual dB, no normalization
	private gainCache = new Map<number, number>()
	private trimCache = new Map<number, number>()

	// After writing trim we ignore incoming trim echoes for a short cooldown.
	// Without this, a delayed echo from a prior query can overwrite trimCache
	// with a stale value — making isChannelCompOk fail until the next gain push.
	private trimCooldown = new Set<number>()
	private trimCooldownTimers = new Map<number, NodeJS.Timeout>()

	private snapshotTakenAt?: Date
	private snapshotTimer?: NodeJS.Timeout

	// Background reconciliation sweep
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
				const gain = extractValue(args)
				if (gain === null) continue

				this.gainCache.set(ch, gain)
				this.emitChannelVariables(ch)

				if (this.refs.has(ch)) {
					this.emit('check-feedbacks', ['channel-needs-comp'])
					// Fire compensation whenever trim is out of sync — not just on value change.
					// Using isChannelCompOk as the gate handles all cases: new gain, gain
					// returning to ref with stale trim, or trimCache corrupted by a stale echo.
					if (this.enabled && this.mode === 'auto' && !this.isChannelCompOk(ch)) {
						this.applyCompensationForChannel(ch)
					}
				}
				continue
			}

			const trimMatch = msg.address.match(RE_TRIM)
			if (trimMatch) {
				const ch = parseInt(trimMatch[1])
				const trim = extractValue(args)
				if (trim === null) continue

				// /*S pushes are 1-arg (engineer changed trim on console) — always accept.
				// Query echos are 3-arg (from sendCommand's empty follow-up query) —
				// ignore during cooldown so stale echos from prior queries don't
				// overwrite the locally-set trimCache value.
				if (args.length >= 3 && this.trimCooldown.has(ch)) continue

				this.trimCache.set(ch, trim)
				this.emitChannelVariables(ch)
				if (this.refs.has(ch)) this.emit('check-feedbacks', ['channel-needs-comp'])
			}
		}
	}

	// ─── Public API ───────────────────────────────────────────────────────────

	takeSnapshot(): void {
		if (this.snapshotTimer) clearTimeout(this.snapshotTimer)
		// Query all channels; responses come back through processMessage → gainCache/trimCache
		for (let ch = 1; ch <= this.model.channels; ch++) {
			this.emit('ensure-loaded', ChannelCommands.InputGain(ch))
			this.emit('ensure-loaded', ChannelCommands.InputTrim(ch))
		}
		// Capture refs after responses have arrived (stateHandler concurrency=100, ~200ms for 80 paths)
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
		this.emitGlobalVariables()
		this.emit('check-feedbacks', ['gain-comp-active', 'gain-comp-manual-active'])
	}

	compensateChannel(ch: number): void {
		// getNodeNumberFromID returns a string typed as number — normalise to a real integer
		// so Map lookups against parseInt() keys work correctly.
		const c = Number(ch)
		if (!this.refs.has(c)) return
		this.emit('ensure-loaded', ChannelCommands.InputGain(c))
		this.emit('ensure-loaded', ChannelCommands.InputTrim(c))
		setTimeout(() => this.applyCompensationForChannel(c), 400)
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
		const c = Number(ch)
		const ref = this.refs.get(c)
		if (!ref) return true
		const currentGain = this.gainCache.get(c)
		const currentTrim = this.trimCache.get(c)
		if (currentGain === undefined || currentTrim === undefined) return true
		const expected = Math.max(TRIM_MIN, Math.min(TRIM_MAX, ref.trim - (currentGain - ref.gain)))
		return Math.abs(currentTrim - expected) <= TRIM_TOLERANCE
	}

	getCompDelta(ch: number): number | undefined {
		const c = Number(ch)
		const ref = this.refs.get(c)
		if (!ref) return undefined
		const g = this.gainCache.get(c)
		return g !== undefined ? g - ref.gain : undefined
	}

	destroy(): void {
		this.stopSweep()
		if (this.snapshotTimer) clearTimeout(this.snapshotTimer)
		for (const t of this.trimCooldownTimers.values()) clearTimeout(t)
		this.trimCooldownTimers.clear()
		this.trimCooldown.clear()
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

	private applyCompensationForChannel(ch: number): void {
		const ref = this.refs.get(ch)
		if (!ref) return
		const currentGain = this.gainCache.get(ch)
		if (currentGain === undefined) {
			this.logger?.warn(`GainComp: no gain cached for ch${ch}, skipping`)
			return
		}
		const delta = currentGain - ref.gain
		const newTrim = Math.max(TRIM_MIN, Math.min(TRIM_MAX, ref.trim - delta))

		// Skip if trim is already correct within tolerance (called via isChannelCompOk gate,
		// so this is just a safety guard for floating-point edge cases)
		if (Math.abs(newTrim - (this.trimCache.get(ch) ?? 0)) < TRIM_TOLERANCE) return

		// Update local cache immediately. Block 3-arg query echos for 1s so that
		// queued echos from earlier rapid gain changes cannot corrupt trimCache after
		// the cooldown expires. 1-arg /*S pushes (manual console changes) bypass this.
		this.trimCache.set(ch, newTrim)
		const existing = this.trimCooldownTimers.get(ch)
		if (existing) clearTimeout(existing)
		this.trimCooldown.add(ch)
		this.trimCooldownTimers.set(
			ch,
			setTimeout(() => {
				this.trimCooldown.delete(ch)
				this.trimCooldownTimers.delete(ch)
			}, 1000),
		)
		this.emit('send', ChannelCommands.InputTrim(ch), newTrim)
		this.logger?.debug(`GainComp: ch${ch} Δgain=${delta.toFixed(2)}dB → trim=${newTrim.toFixed(2)}dB`)
		this.emitChannelVariables(ch)
		this.emit('check-feedbacks', ['channel-needs-comp'])
	}

	private startSweep(): void {
		this.stopSweep()
		this.sweepTimer = setInterval(() => {
			if (!this.enabled || this.mode !== 'auto') return
			for (let ch = 1; ch <= this.model.channels; ch++) {
				if (!this.refs.has(ch)) continue
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
		// Emit gain and trim directly so the strip preset updates without waiting for the
		// variable handler's debounce (which can be up to 1000ms).
		const gain = this.gainCache.get(ch)
		if (gain !== undefined) vars[`ch${ch}_gain`] = Math.round(gain * 10) / 10

		const trim = this.trimCache.get(ch)
		if (trim !== undefined) vars[`ch${ch}_trim`] = Math.round(trim * 10) / 10

		const delta = this.getCompDelta(ch)
		vars[`ch${ch}_comp_delta`] = delta !== undefined ? (delta >= 0 ? '+' : '') + delta.toFixed(1) : ''
		vars[`ch${ch}_trim_ok`] = this.isChannelCompOk(ch) ? 1 : 0
	}
}
