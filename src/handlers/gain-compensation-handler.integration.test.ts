/**
 * Integration test: real Wing mixer at 192.168.1.199
 *
 * Proves (or disproves) that ch1_gain updates on EVERY continuous gain change.
 * No compensation required — purely tracks whether /*S pushes reach the handler
 * and the variable updates without gaps.
 *
 * Run: yarn vitest run --reporter=verbose gain-compensation-handler.integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as dgram from 'dgram'
import { GainCompensationHandler } from './gain-compensation-handler.js'
import type { OscMessage } from 'osc'
import type { CompanionVariableValues } from '@companion-module/base'

// ─── Config ───────────────────────────────────────────────────────────────────

const WING_HOST = '192.168.1.199'
const WING_PORT = 2223
const CHANNEL = 1
const REF_GAIN = 10
const TEST_DURATION_MS = 35_000
const STEP_INTERVAL_MS = 300
const RAMP_STEP = 0.5

// ─── Minimal OSC encode/decode (no external deps beyond dgram) ───────────────

function padTo4(n: number) { return Math.ceil(n / 4) * 4 }

function encodeOscFloat(address: string, value: number): Buffer {
	const addrBuf = Buffer.alloc(padTo4(address.length + 1))
	addrBuf.write(address)
	const tagBuf = Buffer.alloc(padTo4(',f'.length + 1))
	tagBuf.write(',f')
	const valBuf = Buffer.allocUnsafe(4)
	valBuf.writeFloatBE(value, 0)
	return Buffer.concat([addrBuf, tagBuf, valBuf])
}

function encodeOscNoArgs(address: string): Buffer {
	const addrBuf = Buffer.alloc(padTo4(address.length + 1))
	addrBuf.write(address)
	const tagBuf = Buffer.alloc(padTo4(','.length + 1))
	tagBuf.write(',')
	return Buffer.concat([addrBuf, tagBuf])
}

function decodeOsc(buf: Buffer): OscMessage | null {
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const osc = require('osc') as typeof import('osc')
		return (osc as any).readPacket(buf, { metadata: true }) as OscMessage
	} catch {
		return null
	}
}

function send(sock: dgram.Socket, buf: Buffer) {
	sock.send(buf, WING_PORT, WING_HOST)
}

// ─── Test ─────────────────────────────────────────────────────────────────────

describe('ch1_gain variable — integration test against real Wing', () => {
	let sock: dgram.Socket
	let handler: GainCompensationHandler
	let variables: Record<string, number | string>
	let ioGrp = 'LCL'
	let ioIdx = CHANNEL

	beforeAll(async () => {
		sock = dgram.createSocket('udp4')
		sock.bind(0)
		variables = {}

		handler = new GainCompensationHandler({ channels: 40 } as any)
		handler.on('update-variables', (vars: CompanionVariableValues) => Object.assign(variables, vars))
		handler.on('send', (cmd: string, val: number) => {
			send(sock, encodeOscFloat(cmd, val))
		})
		handler.on('ensure-loaded', (path: string) => {
			send(sock, encodeOscNoArgs(path))
		})

		// Subscribe and renew /*S every second
		send(sock, encodeOscNoArgs('/*S'))
		const renewTimer = setInterval(() => send(sock, encodeOscNoArgs('/*S')), 1000)

		// Forward all incoming messages to handler
		sock.on('message', (buf) => {
			const msg = decodeOsc(buf)
			if (msg) handler.processMessage(new Set([msg as any]))
		})

		// Discover ch1 IO routing
		await new Promise<void>((resolve) => {
			const grpPath = `/ch/${CHANNEL}/in/conn/grp`
			const idxPath = `/ch/${CHANNEL}/in/conn/in`
			let grp: string | undefined, idx: number | undefined

			const sub = (buf: Buffer) => {
				const msg = decodeOsc(buf)
				if (!msg) return
				const args = msg.args as any[]
				if (msg.address === grpPath) grp = String(args[0]?.value ?? args[2]?.value ?? 'LCL')
				if (msg.address === idxPath) {
					const raw = args[0]?.value ?? args[2]?.value
					idx = typeof raw === 'number' ? Math.round(raw) : CHANNEL
				}
				if (grp && idx !== undefined) {
					sock.off('message', sub)
					ioGrp = grp; ioIdx = idx
					resolve()
				}
			}
			sock.on('message', sub)
			send(sock, encodeOscNoArgs(grpPath))
			send(sock, encodeOscNoArgs(idxPath))
			setTimeout(() => { sock.off('message', sub); resolve() }, 3000)
		})

		console.log(`[integration] ch${CHANNEL} → /io/in/${ioGrp}/${ioIdx}/g`)

		// Set gain to reference
		send(sock, encodeOscFloat(`/io/in/${ioGrp}/${ioIdx}/g`, REF_GAIN))
		await new Promise((r) => setTimeout(r, 800))
		clearInterval(renewTimer)
	}, 15_000)

	afterAll(() => {
		send(sock, encodeOscFloat(`/io/in/${ioGrp}/${ioIdx}/g`, REF_GAIN))
		handler.destroy()
		setTimeout(() => sock.close(), 200)
	})

	it(
		`ch1_gain variable updates on every continuous gain change over ${TEST_DURATION_MS / 1000}s`,
		async () => {
			const gainPath = `/io/in/${ioGrp}/${ioIdx}/g`
			const start = Date.now()
			const errors: string[] = []
			const log: Array<{ t: number; sent: number; received: number | undefined }> = []
			let stepCount = 0
			let missedUpdates = 0

			// Ramp: REF±8 dB
			const LO = Math.max(-3, REF_GAIN - 8)
			const HI = Math.min(18, REF_GAIN + 8)
			let current = REF_GAIN
			let dir = 1

			while (Date.now() - start < TEST_DURATION_MS) {
				current = Math.round((current + dir * RAMP_STEP) * 2) / 2
				if (current >= HI) dir = -1
				if (current <= LO) dir = 1
				stepCount++

				send(sock, encodeOscFloat(gainPath, current))
				// Query the read-only mirror so Wing pushes back the updated $g value
				send(sock, encodeOscNoArgs(`/ch/${CHANNEL}/in/set/$g`))
				await new Promise((r) => setTimeout(r, STEP_INTERVAL_MS))

				const observed = Number(variables[`ch${CHANNEL}_gain`])
				const diff = Math.abs(observed - current)
				const entry = { t: Date.now() - start, sent: current, received: observed }
				log.push(entry)

				// Allow 1 dB tolerance (Wing may round or Wing responds to previous step)
				if (diff > 1.1) {
					missedUpdates++
					errors.push(`step ${stepCount} @${entry.t}ms: sent ${current} got ${observed} (diff ${diff.toFixed(1)})`)
				}

				if (stepCount % Math.round(5000 / STEP_INTERVAL_MS) === 0) {
					console.log(
						`[integration] ${(entry.t / 1000).toFixed(1)}s step ${stepCount}: sent=${current} got=${observed} missed=${missedUpdates}/${stepCount}`,
					)
				}
			}

			const elapsed = Date.now() - start
			const successRate = ((stepCount - missedUpdates) / stepCount * 100).toFixed(1)

			console.log(`\n[integration] === RESULTS ===`)
			console.log(`  Duration:     ${(elapsed / 1000).toFixed(1)}s`)
			console.log(`  Steps:        ${stepCount}`)
			console.log(`  Missed:       ${missedUpdates}/${stepCount}`)
			console.log(`  Success rate: ${successRate}%`)
			if (errors.length > 0) {
				console.log(`\n  First 15 gaps:`)
				errors.slice(0, 15).forEach((e) => console.log(`    ${e}`))
			}

			expect(elapsed).toBeGreaterThanOrEqual(30_000)
			expect(stepCount).toBeGreaterThan(50)
			expect(
				missedUpdates,
				`${missedUpdates}/${stepCount} gain updates not reflected:\n${errors.slice(0, 15).join('\n')}`,
			).toBe(0)
		},
		50_000,
	)
})
