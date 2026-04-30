import { CompanionActionDefinitions } from '@companion-module/base'
import { CompanionActionWithCallback } from './common.js'
import { InstanceBaseExt } from '../types.js'
import { WingConfig } from '../config.js'
import { GetDropdownWithVariables, GetOnOffToggleDropdownWithVariables } from '../choices/common.js'
import { getStringWithVariables, getNumberWithVariables, getNodeNumberFromID } from './utils.js'
import { EffectCommands, resolveInsertOnPath } from '../commands/effect.js'
import { StateUtil } from '../state/index.js'
import { FadeDurationChoice } from '../choices/fades.js'
import { runTransition } from './utils.js'

export enum FxActionId {
	SetFxMix = 'fx-set-fxmix',
	StoreFxMix = 'fx-store-fxmix',
	RestoreFxMix = 'fx-restore-fxmix',
	SetFxInsertOn = 'fx-set-insert-on',
}

export function createFxActions(self: InstanceBaseExt<WingConfig>): CompanionActionDefinitions {
	const send = self.connection!.sendCommand.bind(self.connection)
	const ensureLoaded = self.stateHandler!.ensureLoaded.bind(self.stateHandler)
	const state = self.stateHandler?.state
	const transitions = self.transitions
	if (!state) return {}

	const actions: { [id in FxActionId]: CompanionActionWithCallback | undefined } = {
		[FxActionId.SetFxMix]: {
			name: 'FX Slot - Set Mix',
			description: 'Set the wet/dry mix percentage of an FX slot (0 silences the effect).',
			options: [
				...GetDropdownWithVariables('FX Slot', 'slot', state.namedChoices.effects),
				{
					type: 'number',
					label: 'Mix %',
					id: 'mix',
					default: 100,
					min: 0,
					max: 100,
					step: 1,
				},
				...FadeDurationChoice(),
			],
			callback: async (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const mix = getNumberWithVariables(event, 'mix')
				const cmd = EffectCommands.FxMix(slotNum)
				runTransition(cmd, 'mix', event, state, transitions, mix, false)
			},
			subscribe: (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				self.stateHandler?.ensureLoaded(EffectCommands.FxMix(slotNum))
			},
		},

		[FxActionId.StoreFxMix]: {
			name: 'FX Slot - Store Mix',
			description: 'Store the current fxmix of an FX slot for later restore.',
			options: [...GetDropdownWithVariables('FX Slot', 'slot', state.namedChoices.effects)],
			callback: async (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const cmd = EffectCommands.FxMix(slotNum)
				StateUtil.storeValueForCommand(cmd, state)
			},
		},

		[FxActionId.RestoreFxMix]: {
			name: 'FX Slot - Restore Mix',
			description: 'Restore the previously stored fxmix of an FX slot.',
			options: [...GetDropdownWithVariables('FX Slot', 'slot', state.namedChoices.effects), ...FadeDurationChoice()],
			callback: async (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const cmd = EffectCommands.FxMix(slotNum)
				const restoreVal = StateUtil.getValueFromKey(cmd, state)
				runTransition(cmd, 'mix', event, state, transitions, restoreVal, false)
			},
		},

		[FxActionId.SetFxInsertOn]: {
			name: 'FX Slot - Set Insert On',
			description:
				'Enable or bypass an FX slot insert on its assigned channel. Uses /fx/N/$a_chn and /fx/N/$a_pos to resolve the target.',
			options: [
				...GetDropdownWithVariables('FX Slot', 'slot', state.namedChoices.effects),
				...GetOnOffToggleDropdownWithVariables('enable', 'Enable', true),
			],
			callback: async (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const val = getNumberWithVariables(event, 'enable')

				const ch = StateUtil.getNumberFromState(EffectCommands.AssignedChannel(slotNum), state)
				const pos = StateUtil.getNumberFromState(EffectCommands.AssignedInsertSlot(slotNum), state)
				if (ch === undefined || pos === undefined) return

				const onCmd = resolveInsertOnPath(ch, pos)
				if (!onCmd) return
				const current = StateUtil.getBooleanFromState(onCmd, state)
				const newVal = val < 2 ? val : Number(!current)
				await send(onCmd, newVal)
			},
			subscribe: (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				ensureLoaded(EffectCommands.AssignedChannel(slotNum))
				ensureLoaded(EffectCommands.AssignedInsertSlot(slotNum))
			},
		},
	}

	return actions
}
