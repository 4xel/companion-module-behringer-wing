/**
 * Integration test: real Wing mixer at 192.168.1.199
 *
 * Option B: TCP binary write + OSC direct query read-back.
 * - Gain changes go via TCP port 2222 (binary token protocol, channel 2)
 *   → does NOT touch the /*S OSC subscription at all
 * - Verification goes via direct OSC UDP query to /ch/N/in/set/$g
 *   → Wing responds directly, no /*S subscription needed
 * - Companion module keeps the sole /*S subscription → no competition
 *
 * Run: yarn test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as net from 'net'
import * as dgram from 'dgram'
import osc, { OscMessage } from 'osc'

// ─── Config ───────────────────────────────────────────────────────────────────

const WING_HOST = '192.168.1.199'
const WING_UDP_PORT = 2223
const WING_TCP_PORT = 2222
const CHANNEL = 1
const REF_GAIN = 10
const TEST_DURATION_MS = 35_000
const STEP_INTERVAL_MS = 400
const RAMP_STEP = 0.5

// ─── OSC helpers (UDP, no /*S) ────────────────────────────────────────────────

function padTo4(n: number) {
	return Math.ceil(n / 4) * 4
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
		return (osc as any).readPacket(buf, { metadata: true }) as OscMessage
	} catch {
		return null
	}
}

// ─── TCP binary protocol helpers ──────────────────────────────────────────────

/**
 * Escape 0xdf bytes in data payload (0xdf → 0xdf, 0xde).
 * Channel-select sequences (0xdf, 0xd0-0xdd) are NOT data and don't go through here.
 */
function escapePayload(data: Buffer): Buffer {
	const out: number[] = []
	for (const b of data) {
		if (b === 0xdf) {
			out.push(0xdf, 0xde)
		} else {
			out.push(b)
		}
	}
	return Buffer.from(out)
}

/** Select channel 2 (Audio Engine, ChID = 1 → 0xd0 + 1 = 0xd1) */
const CHAN2_SELECT = Buffer.from([0xdf, 0xd1])

/** Build token sequence to navigate from root to a path like "io/in/A/1/g" */
function pathTokens(path: string): number[] {
	const tokens: number[] = [0xda] // root
	for (const part of path.split('/').filter(Boolean)) {
		const idx = parseInt(part, 10)
		if (!isNaN(idx) && idx >= 1 && idx <= 64) {
			tokens.push(0x40 + (idx - 1)) // 0x40 = index 1, 0x41 = index 2 …
		} else {
			const bytes = Buffer.from(part, 'ascii')
			// 0xc0=1-char name, 0xc1=2-char, ..., 0xcf=16-char (token = 0xc0 + len - 1)
			tokens.push(0xc0 + bytes.length - 1, ...bytes)
		}
	}
	return tokens
}

/** Write a float32 to a Wing parameter path via TCP channel 2 */
function tcpSetFloat(sock: net.Socket, path: string, value: number, debug = false): void {
	const floatBuf = Buffer.allocUnsafe(4)
	floatBuf.writeFloatBE(value, 0)
	const payload = Buffer.from([...pathTokens(path), 0xd5, ...floatBuf])
	const escaped = escapePayload(payload)
	const msg = Buffer.concat([CHAN2_SELECT, escaped])
	if (debug) console.log(`[tcp-tx] path=${path} val=${value} bytes: ${msg.toString('hex').match(/../g)?.join(' ')}`)
	sock.write(msg)
}

// ─── Test ─────────────────────────────────────────────────────────────────────

describe('ch1_gain — TCP write + OSC query read-back (no /*S in test)', () => {
	let tcpSock: net.Socket
	let udpSock: dgram.Socket
	let ioGrp = 'LCL'
	let ioIdx = CHANNEL

	// Query /ch/N/in/set/$g via OSC UDP — direct response, no /*S subscription
	async function queryGain(): Promise<number | null> {
		const path = `/ch/${CHANNEL}/in/set/$g`
		return new Promise((resolve) => {
			const onMsg = (buf: Buffer) => {
				const msg = decodeOsc(buf)
				if (msg?.address === path) {
					const args = msg.args as any[]
					const raw = args.length >= 3 ? args[2]?.value : args[0]?.value
					if (typeof raw === 'number') {
						udpSock.off('message', onMsg)
						resolve(Math.round(raw * 10) / 10)
					}
				}
			}
			udpSock.on('message', onMsg)
			udpSock.send(encodeOscNoArgs(path), WING_UDP_PORT, WING_HOST)
			setTimeout(() => {
				udpSock.off('message', onMsg)
				resolve(null)
			}, 600)
		})
	}

	beforeAll(async () => {
		// UDP socket — query only, never sends /*S
		udpSock = dgram.createSocket('udp4')
		udpSock.bind(0)

		// TCP socket — channel 2 binary writes
		tcpSock = new net.Socket()
		tcpSock.on('data', (buf: Buffer) => {
			// Log raw TCP responses to see what Wing sends back
			console.log(`[tcp-rx] ${buf.length}B: ${buf.toString('hex').match(/../g)?.slice(0, 20).join(' ')}`)
		})
		await new Promise<void>((resolve, reject) => {
			tcpSock.connect(WING_TCP_PORT, WING_HOST, resolve)
			tcpSock.on('error', reject)
		})

		// Discover ch1 IO routing via OSC query
		await new Promise<void>((resolve) => {
			const grpPath = `/ch/${CHANNEL}/in/conn/grp`
			const idxPath = `/ch/${CHANNEL}/in/conn/in`
			let grp: string | undefined, idx: number | undefined

			const onMsg = (buf: Buffer) => {
				const msg = decodeOsc(buf)
				if (!msg) return
				const args = msg.args as any[]
				if (msg.address === grpPath) grp = String(args[0]?.value ?? args[2]?.value ?? 'LCL')
				if (msg.address === idxPath) {
					const raw = args[0]?.value ?? args[2]?.value
					idx = typeof raw === 'number' ? Math.round(raw) : CHANNEL
				}
				if (grp && idx !== undefined) {
					udpSock.off('message', onMsg)
					ioGrp = grp
					ioIdx = idx
					resolve()
				}
			}
			udpSock.on('message', onMsg)
			udpSock.send(encodeOscNoArgs(grpPath), WING_UDP_PORT, WING_HOST)
			udpSock.send(encodeOscNoArgs(idxPath), WING_UDP_PORT, WING_HOST)
			setTimeout(() => {
				udpSock.off('message', onMsg)
				resolve()
			}, 3000)
		})

		console.log(`[tcp-test] ch${CHANNEL} → TCP path: io/in/${ioGrp}/${ioIdx}/g`)

		// Reset to reference via TCP (debug=true to log first write)
		tcpSetFloat(tcpSock, `io/in/${ioGrp}/${ioIdx}/g`, REF_GAIN, true)
		await new Promise((r) => setTimeout(r, 500))
	}, 15_000)

	afterAll(() => {
		tcpSetFloat(tcpSock, `io/in/${ioGrp}/${ioIdx}/g`, REF_GAIN)
		setTimeout(() => {
			tcpSock.destroy()
			udpSock.close()
		}, 300)
	})

	it(`writes gain via TCP, reads back via OSC query for ${TEST_DURATION_MS / 1000}s — no /*S interference`, async () => {
		const gainTcpPath = `io/in/${ioGrp}/${ioIdx}/g`
		const start = Date.now()
		const errors: string[] = []
		let stepCount = 0
		let missedUpdates = 0
		let nullResponses = 0

		const LO = Math.max(-3, REF_GAIN - 8)
		const HI = Math.min(18, REF_GAIN + 8)
		let current = REF_GAIN
		let dir = 1

		while (Date.now() - start < TEST_DURATION_MS) {
			current = Math.round((current + dir * RAMP_STEP) * 2) / 2
			if (current >= HI) dir = -1
			if (current <= LO) dir = 1
			stepCount++

			// Write via TCP (does not affect /*S subscription)
			tcpSetFloat(tcpSock, gainTcpPath, current)

			// Read back via direct OSC query (no /*S)
			await new Promise((r) => setTimeout(r, STEP_INTERVAL_MS))
			const observed = await queryGain()

			if (observed === null) {
				nullResponses++
				errors.push(`step ${stepCount} @${Date.now() - start}ms: no OSC query response`)
			} else {
				const diff = Math.abs(observed - current)
				if (diff > 1.1) {
					missedUpdates++
					errors.push(
						`step ${stepCount} @${Date.now() - start}ms: sent=${current} got=${observed} diff=${diff.toFixed(1)}`,
					)
				}
			}

			if (stepCount % Math.round(5000 / STEP_INTERVAL_MS) === 0) {
				const elapsed = ((Date.now() - start) / 1000).toFixed(1)
				console.log(
					`[tcp-test] ${elapsed}s step ${stepCount}: sent=${current} got=${observed ?? 'null'} ` +
						`missed=${missedUpdates} null=${nullResponses}`,
				)
			}
		}

		const elapsed = Date.now() - start
		const total = stepCount
		const success = (((total - missedUpdates - nullResponses) / total) * 100).toFixed(1)

		console.log(`\n[tcp-test] === RESULTS ===`)
		console.log(`  Duration:      ${(elapsed / 1000).toFixed(1)}s`)
		console.log(`  Steps:         ${total}`)
		console.log(`  Null responses:${nullResponses}`)
		console.log(`  Missed:        ${missedUpdates}`)
		console.log(`  Success rate:  ${success}%`)
		if (errors.length) {
			console.log(`\n  First 10 errors:`)
			errors.slice(0, 10).forEach((e) => console.log(`    ${e}`))
		}

		expect(elapsed).toBeGreaterThanOrEqual(30_000)
		expect(stepCount).toBeGreaterThan(50)
		expect(nullResponses, 'Wing should respond to all OSC queries').toBe(0)
		expect(
			missedUpdates,
			`${missedUpdates}/${total} gain values not reflected:\n${errors.slice(0, 10).join('\n')}`,
		).toBe(0)
	}, 50_000)
})
