import { SomeCompanionActionInputField } from '@companion-module/base'
import { CompanionActionWithCallback, WingActionDefinitions } from './common.js'
import { InstanceBaseExt } from '../types.js'
import { WingConfig } from '../config.js'
import { GetDropdownWithVariables } from '../choices/common.js'
import { getTalkbackOptions } from '../choices/config.js'
import { ConfigurationCommands } from '../commands/config.js'
import { StateUtil } from '../state/index.js'
import * as ActionUtil from './utils.js'
import { getIdLabelPair } from '../choices/utils.js'

export enum TalkbackSwitcherActionId {
	ExclusiveDest = 'tb-exclusive-dest',
	AdditiveDest = 'tb-additive-dest',
	Back = 'tb-back',
	AllCall = 'tb-all-call',
	Off = 'tb-off',
}

// One level of destination-assignment history per talkback bus.
const history = new Map<string, Map<string, number>>()

function getAllDestPaths(talkback: string, busses: number, matrices: number, mains: number): string[] {
	const paths: string[] = []
	for (let i = 1; i <= busses; i++) paths.push(ConfigurationCommands.TalkbackBusAssign(talkback, i))
	for (let i = 1; i <= matrices; i++) paths.push(ConfigurationCommands.TalkbackMatrixAssign(talkback, i))
	for (let i = 1; i <= mains; i++) paths.push(ConfigurationCommands.TalkbackMainAssign(talkback, i))
	return paths
}

export function createTalkbackSwitcherActions(self: InstanceBaseExt<WingConfig>): WingActionDefinitions {
	const send = self.connection!.sendCommand.bind(self.connection)
	if (!self.stateHandler?.state) throw new Error('State not available')
	const state = self.stateHandler.state

	const { busses, matrices, mains } = self.model

	const destinations = [...state.namedChoices.busses, ...state.namedChoices.matrices, ...state.namedChoices.mains]

	function snapshotCurrent(talkback: string): void {
		const snap = new Map<string, number>()
		for (const p of getAllDestPaths(talkback, busses, matrices, mains)) {
			snap.set(p, StateUtil.getNumberFromState(p, state) ?? 0)
		}
		history.set(talkback, snap)
	}

	async function clearAll(talkback: string): Promise<void> {
		for (const p of getAllDestPaths(talkback, busses, matrices, mains)) {
			await send(p, 0)
			state.set(p, [{ type: 'i', value: 0 }])
		}
	}

	const actions: { [id in TalkbackSwitcherActionId]: CompanionActionWithCallback } = {
		[TalkbackSwitcherActionId.ExclusiveDest]: {
			name: 'Talkback - Set Exclusive Destination',
			description:
				'Route a talkback bus to one or more selected destinations, clearing all others. Optionally open the mic simultaneously.',
			options: [
				...GetDropdownWithVariables('Talkback', 'tb', getTalkbackOptions()),
				{
					type: 'multidropdown',
					id: 'dests',
					label: 'Destinations',
					choices: destinations,
					default: destinations.slice(0, 1).map((d) => d.id),
					minSelection: 1,
				} satisfies SomeCompanionActionInputField,
				...GetDropdownWithVariables('Open Mic', 'open_mic', [
					getIdLabelPair('0', 'No — switch destination only'),
					getIdLabelPair('1', 'Yes — switch destination and open mic'),
				]),
			],
			callback: async (event) => {
				const tb = ActionUtil.getStringWithVariables(event, 'tb')
				const selected = (event.options['dests'] ?? []) as string[]
				const openMic = ActionUtil.getNumberWithVariables(event, 'open_mic')

				snapshotCurrent(tb)
				await clearAll(tb)

				for (const destId of selected) {
					const cmd = ActionUtil.getTalkbackAssignCommand(tb, destId)
					if (cmd) {
						await send(cmd, 1)
						state.set(cmd, [{ type: 'i', value: 1 }])
					}
				}

				if (openMic === 1) {
					await send(ConfigurationCommands.TalkbackOn(tb), 1)
				}
			},
		},

		[TalkbackSwitcherActionId.AdditiveDest]: {
			name: 'Talkback - Toggle Destination (Additive)',
			description: 'Toggle a single talkback destination on/off without clearing the others.',
			options: [
				...GetDropdownWithVariables('Talkback', 'tb', getTalkbackOptions()),
				...GetDropdownWithVariables('Destination', 'dest', destinations),
			],
			callback: async (event) => {
				const tb = ActionUtil.getStringWithVariables(event, 'tb')
				const dest = ActionUtil.getStringWithVariables(event, 'dest')
				const targetCmd = ActionUtil.getTalkbackAssignCommand(tb, dest)
				if (!targetCmd) return

				snapshotCurrent(tb)
				const current = StateUtil.getNumberFromState(targetCmd, state) ?? 0
				const newVal = current === 1 ? 0 : 1
				await send(targetCmd, newVal)
				state.set(targetCmd, [{ type: 'i', value: newVal }])
			},
		},

		[TalkbackSwitcherActionId.Back]: {
			name: 'Talkback - Back (Restore Previous Destination)',
			description:
				'Restore the talkback destination to the state before the last exclusive assign, additive toggle, all-call, or off action. One level of history per talkback bus.',
			options: [...GetDropdownWithVariables('Talkback', 'tb', getTalkbackOptions())],
			callback: async (event) => {
				const tb = ActionUtil.getStringWithVariables(event, 'tb')
				const prev = history.get(tb)
				if (!prev) return

				// Snapshot current before restoring so Back is reversible.
				const currentSnap = new Map<string, number>()
				for (const [p] of prev) {
					currentSnap.set(p, StateUtil.getNumberFromState(p, state) ?? 0)
				}

				for (const [p, v] of prev) {
					await send(p, v)
					state.set(p, [{ type: 'i', value: v }])
				}

				history.set(tb, currentSnap)
			},
		},

		[TalkbackSwitcherActionId.AllCall]: {
			name: 'Talkback - All Call',
			description:
				'Route talkback to a configurable set of destinations and open the mic. Use the destination list to define what "all" means for your session.',
			options: [
				...GetDropdownWithVariables('Talkback', 'tb', [...getTalkbackOptions(), getIdLabelPair('AB', 'Both (A + B)')]),
				{
					type: 'multidropdown',
					id: 'allcall_dests',
					label: 'Destinations (your "all call" set)',
					choices: destinations,
					default: destinations.map((d) => d.id),
					minSelection: 1,
				} satisfies SomeCompanionActionInputField,
			],
			callback: async (event) => {
				const tb = ActionUtil.getStringWithVariables(event, 'tb')
				const selected = (event.options['allcall_dests'] ?? []) as string[]

				const doAllCall = async (talkback: string) => {
					snapshotCurrent(talkback)
					// Clear all paths first so destinations not in the selection are turned off.
					for (const p of getAllDestPaths(talkback, busses, matrices, mains)) {
						await send(p, 0)
						state.set(p, [{ type: 'i', value: 0 }])
					}
					for (const destId of selected) {
						const cmd = ActionUtil.getTalkbackAssignCommand(talkback, destId)
						if (cmd) {
							await send(cmd, 1)
							state.set(cmd, [{ type: 'i', value: 1 }])
						}
					}
					await send(ConfigurationCommands.TalkbackOn(talkback), 1)
				}

				if (tb === 'AB') {
					await doAllCall('A')
					await doAllCall('B')
				} else {
					await doAllCall(tb)
				}
			},
		},

		[TalkbackSwitcherActionId.Off]: {
			name: 'Talkback - Off (Clear All Destinations)',
			description: 'Clear all talkback destination assignments. Mic state is left unchanged.',
			options: [...GetDropdownWithVariables('Talkback', 'tb', getTalkbackOptions())],
			callback: async (event) => {
				const tb = ActionUtil.getStringWithVariables(event, 'tb')
				snapshotCurrent(tb)
				await clearAll(tb)
			},
		},
	}

	return actions
}
