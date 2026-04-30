// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace EffectCommands {
	export function Node(effect: number): string {
		return `/fx/${effect}`
	}

	export function Decay(effect: number): string {
		return `${Node(effect)}/dcy`
	}
}
