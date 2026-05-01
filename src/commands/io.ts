// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace IoCommands {
	export function Node(): string {
		return `/io`
	}

	export function MainAltSwitch(): string {
		return `${Node()}/altsw`
	}

	export function InputNode(grp: string, idx: number): string {
		return `${Node()}/in/${grp}/${idx}`
	}

	export function InputGain(grp: string, idx: number): string {
		return `${InputNode(grp, idx)}/g`
	}

	export function InputPhantomPower(grp: string, idx: number): string {
		return `${InputNode(grp, idx)}/vph`
	}
}
