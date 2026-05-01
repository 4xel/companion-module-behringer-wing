import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { GainCompensationHandler } from './gain-compensation-handler.js'
import type { OscMessage } from 'osc'
import type { CompanionVariableValues } from '@companion-module/base'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MODEL = { channels: 40 } as any

/** Build a 1-arg /*S push for /ch/N/in/set/$g — Wing sends actual dB */
function gainPush(ch: number, dB: number): OscMessage {
	return {
		address: `/ch/${ch}/in/set/$g`,
		args: [{ type: 'f', value: dB }],
	} as any
}

/** Build a 3-arg full query response — Wing sends [display, normalized, actual] */
function gainQuery(ch: number, dB: number): OscMessage {
	const normalized = (dB + 3) / 48.5
	return {
		address: `/ch/${ch}/in/set/$g`,
		args: [
			{ type: 's', value: String(dB) },
			{ type: 'f', value: normalized },
			{ type: 'f', value: dB },
		],
	} as any
}

/** Build a 1-arg /*S push for /ch/N/in/set/trim */
function trimPush(ch: number, dB: number): OscMessage {
	return {
		address: `/ch/${ch}/in/set/trim`,
		args: [{ type: 'f', value: dB }],
	} as any
}

function makeHandler() {
	const handler = new GainCompensationHandler(MODEL)
	const variables: Record<string, number | string> = {}
	const sentTrims: Array<{ ch: number; trim: number }> = []
	const ensureLoadedPaths: string[] = []

	handler.on('update-variables', (vars: CompanionVariableValues) => {
		Object.assign(variables, vars)
	})
	handler.on('send', (cmd: string, val: number) => {
		const m = cmd.match(/^\/ch\/(\d+)\/in\/set\/trim$/)
		if (m) sentTrims.push({ ch: parseInt(m[1]), trim: val })
	})
	handler.on('ensure-loaded', (path: string) => {
		ensureLoadedPaths.push(path)
	})

	return { handler, variables, sentTrims, ensureLoadedPaths }
}

function feed(handler: GainCompensationHandler, ...msgs: OscMessage[]) {
	handler.processMessage(new Set(msgs))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GainCompensationHandler', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	// ── extractValue ──────────────────────────────────────────────────────────

	describe('gain value extraction', () => {
		it('reads actual dB from 1-arg /*S push (args[0])', () => {
			const { handler, variables } = makeHandler()
			feed(handler, gainPush(1, 15))
			expect(variables['ch1_gain']).toBe(15)
		})

		it('reads actual dB from 3-arg query response (args[2])', () => {
			const { handler, variables } = makeHandler()
			feed(handler, gainQuery(1, 15))
			expect(variables['ch1_gain']).toBe(15)
		})

		it('updates gain variable on every change', () => {
			const { handler, variables } = makeHandler()
			for (const dB of [5, 10, 15, 20, 25]) {
				feed(handler, gainPush(1, dB))
				expect(variables['ch1_gain']).toBe(dB)
			}
		})

		it('updates gain variable when decreasing', () => {
			const { handler, variables } = makeHandler()
			for (const dB of [25, 20, 15, 10, 5]) {
				feed(handler, gainPush(1, dB))
				expect(variables['ch1_gain']).toBe(dB)
			}
		})

		it('handles negative gain values (below 0 dB)', () => {
			const { handler, variables } = makeHandler()
			feed(handler, gainPush(1, -3))
			expect(variables['ch1_gain']).toBe(-3)
		})
	})

	// ── Snapshot ──────────────────────────────────────────────────────────────

	describe('takeSnapshot', () => {
		it('emits ensure-loaded for all 40 channels gain and trim', () => {
			const { handler, ensureLoadedPaths } = makeHandler()
			handler.takeSnapshot()
			expect(ensureLoadedPaths.filter((p) => p.includes('$g'))).toHaveLength(40)
			expect(ensureLoadedPaths.filter((p) => p.includes('trim'))).toHaveLength(40)
		})

		it('captures refs 1.5s after snapshot is called', () => {
			const { handler } = makeHandler()
			// Populate gainCache first
			for (let ch = 1; ch <= 5; ch++) feed(handler, gainPush(ch, ch * 5))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)
			// Snapshot was taken — refs should now exist
			expect(handler.hasSnapshot()).toBe(true)
		})

		it('captures correct gain and trim at snapshot time', () => {
			const { handler } = makeHandler()
			feed(handler, gainPush(1, 10))
			feed(handler, trimPush(1, 0))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)

			expect(handler.getCompDelta(1)).toBe(0) // gain == ref
		})
	})

	// ── Auto compensation ─────────────────────────────────────────────────────

	describe('auto compensation', () => {
		it('fires trim correction when gain changes after snapshot', () => {
			const { handler, sentTrims } = makeHandler()
			feed(handler, gainPush(1, 10), trimPush(1, 0))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)
			handler.enable('auto')

			// Engineer raises gain by 5 dB
			feed(handler, gainPush(1, 15))

			expect(sentTrims).toHaveLength(1)
			expect(sentTrims[0]).toEqual({ ch: 1, trim: -5 })
		})

		it('correctly compensates for a sequence of increasing gain changes', () => {
			const { handler, sentTrims } = makeHandler()
			feed(handler, gainPush(1, 10), trimPush(1, 0))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)
			handler.enable('auto')

			const steps = [11, 12, 13, 14, 15]
			for (const gain of steps) {
				feed(handler, gainPush(1, gain))
			}

			// Each step should fire a compensation
			expect(sentTrims).toHaveLength(steps.length)
			expect(sentTrims.at(-1)!.trim).toBeCloseTo(-5) // final delta = 15 - 10 = 5
		})

		it('correctly compensates for decreasing gain changes', () => {
			const { handler, sentTrims } = makeHandler()
			feed(handler, gainPush(1, 20), trimPush(1, 0))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)
			handler.enable('auto')

			const steps = [19, 18, 17, 16, 15]
			for (const gain of steps) {
				feed(handler, gainPush(1, gain))
			}

			expect(sentTrims).toHaveLength(steps.length)
			expect(sentTrims.at(-1)!.trim).toBeCloseTo(5) // gain dropped 5 dB → trim +5
		})

		it('clamps trim to ±18 dB maximum', () => {
			const { handler, sentTrims } = makeHandler()
			feed(handler, gainPush(1, 0), trimPush(1, 0))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)
			handler.enable('auto')

			feed(handler, gainPush(1, 25)) // delta = 25 dB, trim would be -25 but clamped
			expect(sentTrims[0].trim).toBe(-18)
		})

		it('does not fire compensation when disabled', () => {
			const { handler, sentTrims } = makeHandler()
			feed(handler, gainPush(1, 10), trimPush(1, 0))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)
			// intentionally NOT calling enable()

			feed(handler, gainPush(1, 15))
			expect(sentTrims).toHaveLength(0)
		})

		it('stops compensating after disable() is called', () => {
			const { handler, sentTrims } = makeHandler()
			feed(handler, gainPush(1, 10), trimPush(1, 0))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)
			handler.enable('auto')

			feed(handler, gainPush(1, 12)) // fires comp
			handler.disable()
			feed(handler, gainPush(1, 14)) // should not fire
			expect(sentTrims).toHaveLength(1)
		})
	})

	// ── isChannelCompOk ───────────────────────────────────────────────────────

	describe('isChannelCompOk', () => {
		it('returns true when no snapshot exists', () => {
			const { handler } = makeHandler()
			feed(handler, gainPush(1, 15))
			expect(handler.isChannelCompOk(1)).toBe(true)
		})

		it('returns true immediately after snapshot (trim matches)', () => {
			const { handler } = makeHandler()
			feed(handler, gainPush(1, 10), trimPush(1, 0))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)
			expect(handler.isChannelCompOk(1)).toBe(true)
		})

		it('returns false when gain changes and trim is not yet compensated', () => {
			const { handler } = makeHandler()
			// Feed both gain AND trim so trimCache is populated
			feed(handler, gainPush(1, 10), trimPush(1, 0))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)

			// Change gain — trimCache still has 0 (old trim), but expected is now -5
			feed(handler, gainPush(1, 15))

			// trim=0 but expected=-5 → not ok
			expect(handler.isChannelCompOk(1)).toBe(false)
		})

		it('returns true after compensation is applied and trim echoes back', () => {
			const { handler, sentTrims } = makeHandler()
			feed(handler, gainPush(1, 10), trimPush(1, 0))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)
			handler.enable('auto')

			feed(handler, gainPush(1, 15)) // triggers comp → trim sent as -5
			vi.advanceTimersByTime(1100) // let cooldown expire

			// Echo the confirmed trim back
			feed(handler, trimPush(1, sentTrims[0].trim))
			expect(handler.isChannelCompOk(1)).toBe(true)
		})
	})

	// ── getCompDelta ──────────────────────────────────────────────────────────

	describe('getCompDelta', () => {
		it('returns undefined before snapshot', () => {
			const { handler } = makeHandler()
			feed(handler, gainPush(1, 10))
			expect(handler.getCompDelta(1)).toBeUndefined()
		})

		it('returns 0 immediately after snapshot', () => {
			const { handler } = makeHandler()
			feed(handler, gainPush(1, 10))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)
			expect(handler.getCompDelta(1)).toBe(0)
		})

		it('returns correct positive delta after gain increase', () => {
			const { handler } = makeHandler()
			feed(handler, gainPush(1, 10))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)
			feed(handler, gainPush(1, 15))
			expect(handler.getCompDelta(1)).toBeCloseTo(5)
		})

		it('returns correct negative delta after gain decrease', () => {
			const { handler } = makeHandler()
			feed(handler, gainPush(1, 20))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)
			feed(handler, gainPush(1, 15))
			expect(handler.getCompDelta(1)).toBeCloseTo(-5)
		})
	})

	// ── Trim cooldown ─────────────────────────────────────────────────────────

	describe('trim echo cooldown', () => {
		it('ignores 3-arg trim echo during cooldown after writing trim', () => {
			const { handler, variables } = makeHandler()
			feed(handler, gainPush(1, 10), trimPush(1, 0))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)
			handler.enable('auto')

			// Comp fires → trimCache=-5, cooldown active
			feed(handler, gainPush(1, 15))
			// Inject stale 3-arg echo with old trim value during cooldown
			feed(handler, {
				address: '/ch/1/in/set/trim',
				args: [
					{ type: 's', value: '0' },
					{ type: 'f', value: 0.5 },
					{ type: 'f', value: 0 },
				],
			} as any)

			// ch1_trim should still show the compensated value (-5), not the stale echo (0)
			expect(variables['ch1_trim']).toBe(-5)
		})

		it('accepts 1-arg /*S trim push (console change) even during cooldown', () => {
			const { handler, variables } = makeHandler()
			feed(handler, gainPush(1, 10), trimPush(1, 0))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)
			handler.enable('auto')

			feed(handler, gainPush(1, 15)) // triggers comp, cooldown active
			// Engineer manually changes trim on console (1-arg push)
			feed(handler, trimPush(1, 3))

			expect(variables['ch1_trim']).toBe(3)
		})

		it('accepts 3-arg trim echo after cooldown expires', () => {
			const { handler, variables } = makeHandler()
			feed(handler, gainPush(1, 10), trimPush(1, 0))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)
			handler.enable('auto')

			feed(handler, gainPush(1, 15)) // comp fires, cooldown 1s
			vi.advanceTimersByTime(1100) // cooldown expires

			feed(handler, {
				address: '/ch/1/in/set/trim',
				args: [
					{ type: 's', value: '-5' },
					{ type: 'f', value: 0.36 },
					{ type: 'f', value: -5 },
				],
			} as any)

			expect(variables['ch1_trim']).toBe(-5)
		})
	})

	// ── 5-second reconciliation sweep ─────────────────────────────────────────

	describe('reconciliation sweep', () => {
		it('corrects drift that reactive path missed after 5 seconds', () => {
			const { handler, sentTrims } = makeHandler()
			feed(handler, gainPush(1, 10), trimPush(1, 0))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)
			handler.enable('auto')

			// Gain changed to 15 — correct trim is -5
			feed(handler, gainPush(1, 15)) // reactive comp fires: sentTrims[0] = -5
			expect(sentTrims).toHaveLength(1)

			// Simulate drift: trimCache gets wrong value (e.g. stale echo overwrote it)
			vi.advanceTimersByTime(1100) // cooldown expires
			handler['trimCache'].set(1, 0) // corrupted — should be -5

			vi.advanceTimersByTime(5000) // 5s sweep fires

			// Sweep sees isChannelCompOk=false (trim=0, expected=-5) and corrects
			const lastTrim = sentTrims.at(-1)!
			expect(lastTrim.trim).toBeCloseTo(-5) // delta=5, newTrim=0-5=-5
		})
	})

	// ── Continuous gain cycling integration test ──────────────────────────────

	describe('continuous gain cycling', () => {
		it('runs for 30 seconds: continuous gain changes with verified compensation on every step', async () => {
			// Real-time test — uses actual timers so the snapshot timer fires naturally
			vi.useRealTimers()

			const { handler, sentTrims, variables } = makeHandler()
			const errors: string[] = []

			// Establish reference at gain=10, trim=0
			feed(handler, gainPush(1, 10), trimPush(1, 0))
			handler.takeSnapshot()

			// Wait for captureRefs (1500ms real time)
			await new Promise((r) => setTimeout(r, 1600))
			expect(handler.hasSnapshot()).toBe(true)
			handler.enable('auto')

			const REF_GAIN = 10
			const STEP_MS = 200 // one gain change every 200ms
			const TOTAL_MS = 30_000
			const START = Date.now()

			// Generate a repeating ramp: -3 to 18 and back, in 0.5 dB steps
			const ramp: number[] = []
			for (let g = -3; g <= 18; g += 0.5) ramp.push(Math.round(g * 2) / 2)
			for (let g = 17.5; g >= -3; g -= 0.5) ramp.push(Math.round(g * 2) / 2)

			let stepIdx = 0

			while (Date.now() - START < TOTAL_MS) {
				const gain = ramp[stepIdx % ramp.length]
				stepIdx++

				const prevTrimCount = sentTrims.length
				feed(handler, gainPush(1, gain))

				// Verify variable updated
				if (variables['ch1_gain'] !== gain) {
					errors.push(`step ${stepIdx}: ch1_gain=${variables['ch1_gain']} expected ${gain}`)
				}

				// Verify delta tracked correctly
				const delta = handler.getCompDelta(1)
				const expectedDelta = gain - REF_GAIN
				if (delta === undefined || Math.abs(delta - expectedDelta) > 0.1) {
					errors.push(`step ${stepIdx}: delta=${delta} expected ${expectedDelta}`)
				}

				// Verify trim was sent when gain changed
				if (sentTrims.length > prevTrimCount) {
					const lastTrim = sentTrims.at(-1)!
					const expectedTrim = Math.max(-18, Math.min(18, -(gain - REF_GAIN)))
					if (Math.abs(lastTrim.trim - expectedTrim) > 0.1) {
						errors.push(`step ${stepIdx}: trim=${lastTrim.trim} expected ${expectedTrim} for gain=${gain}`)
					}
				}

				await new Promise((r) => setTimeout(r, STEP_MS))
			}

			const elapsed = Date.now() - START
			const totalSteps = stepIdx

			expect(elapsed).toBeGreaterThanOrEqual(30_000)
			expect(totalSteps).toBeGreaterThan(100)
			expect(errors, `Errors after ${totalSteps} steps:\n${errors.join('\n')}`).toHaveLength(0)
		}, 40_000) // vitest timeout: 40s

		it('ch1_gain variable updates on every single step without gaps', () => {
			const { handler } = makeHandler()
			const observed: number[] = []

			handler.on('update-variables', (vars: CompanionVariableValues) => {
				if (vars['ch1_gain'] !== undefined) observed.push(vars['ch1_gain'] as number)
			})

			const gains = Array.from({ length: 30 }, (_, i) => 5 + i * 1.5)
			for (const g of gains) feed(handler, gainPush(1, g))

			expect(observed).toHaveLength(gains.length)
			for (let i = 0; i < gains.length; i++) {
				expect(observed[i]).toBeCloseTo(gains[i], 1)
			}
		})

		it('compensation is not skipped when gain returns to reference value', () => {
			const { handler, sentTrims } = makeHandler()
			feed(handler, gainPush(1, 10), trimPush(1, 0))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)
			handler.enable('auto')

			// Move up, come back
			feed(handler, gainPush(1, 15)) // trim → -5
			vi.advanceTimersByTime(1100) // cooldown
			feed(handler, trimPush(1, -5)) // confirm trim
			feed(handler, gainPush(1, 10)) // back to ref

			// When gain returns to ref, trim should be corrected back to 0
			const lastTrim = sentTrims.at(-1)!
			expect(lastTrim.trim).toBeCloseTo(0)
		})

		it('isChannelCompOk stays true throughout a compensated gain cycle', () => {
			const { handler, sentTrims } = makeHandler()
			feed(handler, gainPush(1, 10), trimPush(1, 0))
			handler.takeSnapshot()
			vi.advanceTimersByTime(1500)
			handler.enable('auto')

			for (const gain of [12, 14, 16, 18, 20, 18, 16, 14, 12, 10]) {
				feed(handler, gainPush(1, gain))
				vi.advanceTimersByTime(1100)
				// Simulate trim echo confirming the sent value
				const t = sentTrims.at(-1)
				if (t) feed(handler, trimPush(1, t.trim))
				expect(handler.isChannelCompOk(1)).toBe(true)
			}
		})
	})
})
