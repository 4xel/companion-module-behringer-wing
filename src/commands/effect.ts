/**
 * Maps a Wing global strip index ($a_chn) to the OSC insert on/off path.
 * ch 1-40, aux 41-48, bus 49-64, main 65-68, mtx 69-76
 * Returns undefined when channelIndex is 0 (unassigned) or out of range.
 */
export function resolveInsertOnPath(channelIndex: number, pos: number): string | undefined {
	let type: string
	let num: number
	if (channelIndex >= 1 && channelIndex <= 40) {
		type = 'ch'
		num = channelIndex
	} else if (channelIndex >= 41 && channelIndex <= 48) {
		type = 'aux'
		num = channelIndex - 40
	} else if (channelIndex >= 49 && channelIndex <= 64) {
		type = 'bus'
		num = channelIndex - 48
	} else if (channelIndex >= 65 && channelIndex <= 68) {
		type = 'main'
		num = channelIndex - 64
	} else if (channelIndex >= 69 && channelIndex <= 76) {
		type = 'mtx'
		num = channelIndex - 68
	} else return undefined
	return `/${type}/${num}/${pos === 0 ? 'preins' : 'postins'}/on`
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace EffectCommands {
	export function Node(effect: number): string {
		return `/fx/${effect}`
	}

	export function Model(effect: number): string {
		return `${Node(effect)}/mdL`
	}

	export function FxMix(effect: number): string {
		return `${Node(effect)}/fxmix`
	}

	export function Decay(effect: number): string {
		return `${Node(effect)}/dcy`
	}

	export function AssignedChannel(effect: number): string {
		return `${Node(effect)}/$a_chn`
	}

	export function AssignedInsertSlot(effect: number): string {
		return `${Node(effect)}/$a_pos`
	}
}
