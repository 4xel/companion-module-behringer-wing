import { CompanionActionDefinition } from '@companion-module/base'
import { SetRequired } from 'type-fest' // eslint-disable-line n/no-missing-import

export type CompanionActionWithCallback = SetRequired<CompanionActionDefinition, 'callback'>

import { CompanionActionDefinitions } from '@companion-module/base'
import {
	GetDropdown,
	GetDropdownWithVariables,
	GetTextFieldWithVariables,
	GetColorDropdown,
	GetNumberFieldWithVariables,
	getDelayModes,
	getIconChoices,
	GetOnOffToggleDropdownWithVariables,
	GetMuteDropdownWithVariables,
	GetFaderInputFieldWithVariables,
	GetFaderDeltaInputFieldWithVariables,
	GetPanoramaSliderWithVariables,
	GetPanoramaDeltaSliderWithVariables,
	GetSendSourceDestinationFieldsWithVariables,
} from '../choices/common.js'
import { runTransition } from './utils.js'
import { InstanceBaseExt } from '../types.js'
import { WingConfig } from '../config.js'
import * as ActionUtil from './utils.js'
import { StateUtil } from '../state/index.js'
import { FadeDurationChoice } from '../choices/fades.js'
import { getIdLabelPair } from '../choices/utils.js'
import { getSourceGroupChoices } from '../choices/common.js'
import { MuteGroupCommands } from '../commands/mutegroup.js'
import { IoCommands } from '../commands/io.js'
import { ConfigurationCommands } from '../commands/config.js'

export enum CommonActions {
	// Setup
	SetMainConnection = 'set-main-connection',
	SetAltConnection = 'set-alt-connection',
	SetAutoSourceSwitch = 'set-auto-source-switch',
	SetMainAlt = 'set-main-alt',
	SetGlobalMainAlt = 'set-global-main-alt',
	SetScribbleLight = 'set-scribble-light',
	SetScribbleLightColor = 'set-scribble-light-color',
	SetName = 'set-name',
	SetIcon = 'set-icon',
	SetSolo = 'set-solo',
	ClearSolo = 'clear-solo',

	// Gain
	SetGain = 'set-gain',
	StoreGain = 'store-gain',
	RestoreGain = 'restore-gain',
	DeltaGain = 'delta-gain',
	UndoDeltaGain = 'undo-delta-gain',
	//////////// NORMAL
	SetMute = 'set-mute',
	// Fader
	SetFader = 'set-fader',
	StoreFader = 'store-fader',
	RestoreFader = 'restore-fader',
	DeltaFader = 'fader-delta',
	UndoDeltaFader = 'undo-fader-delta',
	// Panorama
	SetPanorama = 'set-panorama',
	StorePanorama = 'store-panorama',
	RestorePanorama = 'restore-panorama',
	DeltaPanorama = 'panorama-delta',
	UndoDeltaPanorama = 'undo-panorama',
	// Delay
	SetDelay = 'set-delay',
	SetDelayAmount = 'set-delay-amount',
	// Gate
	SetGateOn = 'set-gate-on',
	// EQ
	SetEqOn = 'set-eq-on',
	// Dynamics
	SetDynamicsOn = 'set-dynamics-on',

	//////////// SEND
	SetSendMute = 'set-send-mute',
	// Send Fader
	SetSendFader = 'set-send-fader',
	StoreSendFader = 'store-send-fader',
	RestoreSendFader = 'restore-send-fader',
	DeltaSendFader = 'delta-send-fader',
	UndoDeltaSendFader = 'undo-send-fader',
	// Send Panorama
	SetSendPanorama = 'set-send-panorama',
	StoreSendPanorama = 'store-send-panorama',
	RestoreSendPanorama = 'restore-send-panorama',
	DeltaSendPanorama = 'delta-send-panorama',
	UndoDeltaSendPanorama = 'undo-send-panorama',

	// Inserts
	SetInsertOn = 'set-insert-on',

	// Monitor engineer tools
	SetPhaseInvert = 'set-phase-invert',
	SetWidth = 'set-width',
	DeltaWidth = 'delta-width',
	SetSendMode = 'set-send-mode',

	// Trim
	SetTrim = 'set-trim',
	AdjustTrim = 'adjust-trim',
	ResetTrim = 'reset-trim',

	// Phantom power
	SetPhantomPower = 'set-phantom-power',

	// Mute groups
	ReleaseAllMuteGroups = 'release-all-mute-groups',

	// Reset
	ResetChannel = 'reset-channel',

	// Headamp gain (IO-resolved)
	SetHeadampGain = 'set-headamp-gain',
	AdjustHeadampGain = 'adjust-headamp-gain',

	// Input patching
	SetInputPatch = 'set-input-patch',

	// RTA
	SetRtaSource = 'set-rta-source',

	// Gain compensation
	TakeGainSnapshot = 'take-gain-snapshot',
	EnableGainComp = 'enable-gain-comp',
	DisableGainComp = 'disable-gain-comp',
	ToggleGainComp = 'toggle-gain-comp',
	CompensateChannel = 'compensate-channel',

	// Batch multi-parameter
	BatchKillSends = 'batch-kill-sends',
	BatchMicroScene = 'batch-micro-scene',
}

export function createCommonActions(self: InstanceBaseExt<WingConfig>): CompanionActionDefinitions {
	const send = self.connection!.sendCommand.bind(self.connection)
	const ensureLoaded = (path: string, arg?: string | number): void => {
		self.connection?.sendCommand(path, arg).catch(() => {})
	}
	const state = self.stateHandler?.state
	const logger = self.logger
	if (!state) {
		logger?.error('State handler or state is not available for creating common actions')
		throw new Error('State handler or state is not available')
	}
	const transitions = self.transitions

	const allChannels = [
		...state.namedChoices.channels,
		...state.namedChoices.auxes,
		...state.namedChoices.busses,
		...state.namedChoices.matrices,
		...state.namedChoices.mains,
	]

	const allSendSources = [
		...state.namedChoices.channels,
		...state.namedChoices.auxes,
		...state.namedChoices.busses,
		...state.namedChoices.mains,
	]

	const channelAuxBusSendDestinations = [
		...state.namedChoices.busses,
		...state.namedChoices.mains,
		...state.namedChoices.matrices,
	]
	const mainSendDestinations = [...state.namedChoices.matrices]

	const actions: { [id in CommonActions]: CompanionActionWithCallback | undefined } = {
		////////////////////////////////////////////////////////////////
		// Setup
		/////////////////////////////////////////////////////////////////
		[CommonActions.SetMainConnection]: {
			name: 'Set Channel/Aux Main Connection',
			description: 'Set the index of the main connection of a channel or aux',
			options: [
				...GetDropdownWithVariables('Channel', 'channel', [
					...state.namedChoices.channels,
					...state.namedChoices.auxes,
				]),
				...GetDropdownWithVariables('Group', 'group', getSourceGroupChoices()),
				...GetNumberFieldWithVariables('Index', 'index', 1, 64, 1, 1),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'channel')
				const group = ActionUtil.getStringWithVariables(event, 'group')
				const index = ActionUtil.getNumberWithVariables(event, 'index')
				let cmd = ActionUtil.getMainInputConnectionGroupCommand(sel)
				await send(cmd, group)
				cmd = ActionUtil.getMainInputConnectionIndexCommand(sel)
				await send(cmd, index)
			},
		},
		[CommonActions.SetAltConnection]: {
			name: 'Set Channel/Aux Alt Connection',
			description: 'Set the index of the alt connection of a channel or aux',
			options: [
				...GetDropdownWithVariables('Channel', 'channel', [
					...state.namedChoices.channels,
					...state.namedChoices.auxes,
				]),
				...GetDropdownWithVariables('Group', 'group', getSourceGroupChoices()),
				...GetNumberFieldWithVariables('Index', 'index', 1, 64, 1, 1),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'channel')
				const group = ActionUtil.getStringWithVariables(event, 'group')
				const index = ActionUtil.getNumberWithVariables(event, 'index')
				let cmd = ActionUtil.getAltInputConnectionGroupCommand(sel)
				await send(cmd, group)
				cmd = ActionUtil.getAltInputConnectionIndexCommand(sel)
				await send(cmd, index)
			},
		},
		[CommonActions.SetAutoSourceSwitch]: {
			name: 'Set Channel/Aux Auto Source Switch',
			description: 'Enable or disable the global switching between main and alt inputs on a channel or aux',
			options: [
				...GetDropdownWithVariables('Channel', 'channel', [
					...state.namedChoices.channels,
					...state.namedChoices.auxes,
				]),
				...GetDropdownWithVariables('Auto Source Switch', 'auto_source', [
					getIdLabelPair('0', 'Individual'),
					getIdLabelPair('1', 'Global'),
					getIdLabelPair('-1', 'Toggle'),
				]),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'channel')
				const autoSource = ActionUtil.getNumberWithVariables(event, 'auto_source')
				const cmd = ActionUtil.getInputAutoSourceSwitchCommand(sel)
				await send(cmd, autoSource)
			},
		},
		[CommonActions.SetMainAlt]: {
			name: 'Set Channel/Aux Main/Alt',
			description: 'Set whether a channel or aux is using the main or alt input',
			options: [
				...GetDropdownWithVariables('Channel', 'channel', [
					...state.namedChoices.channels,
					...state.namedChoices.auxes,
				]),
				...GetDropdownWithVariables('Source', 'main_alt', [
					getIdLabelPair('0', 'Main'),
					getIdLabelPair('1', 'Alt'),
					getIdLabelPair('-1', 'Toggle'),
				]),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'channel')
				const mainAlt = ActionUtil.getNumberWithVariables(event, 'main_alt')
				const cmd = ActionUtil.getInputAltSourceCommand(sel)
				await send(cmd, mainAlt)
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'channel')
				const cmd = ActionUtil.getInputAltSourceCommand(sel)
				if (cmd) ensureLoaded(cmd)
			},
		},

		[CommonActions.SetGlobalMainAlt]: {
			name: 'Set Global Main/Alt Input',
			description: 'Switch all channels between their Main and Alt input sources globally via /io/altsw.',
			options: [
				...GetDropdownWithVariables('Source', 'source', [
					getIdLabelPair('0', 'Main (all channels to main input)'),
					getIdLabelPair('1', 'Alt (all channels to alt input)'),
					getIdLabelPair('-1', 'Toggle'),
				]),
			],
			callback: async (event) => {
				const source = ActionUtil.getNumberWithVariables(event, 'source')
				const cmd = IoCommands.MainAltSwitch()
				if (source === -1) {
					const current = StateUtil.getNumberFromState(cmd, state)
					await send(cmd, current === 0 ? 1 : 0)
				} else {
					await send(cmd, source)
				}
			},
			subscribe: () => {
				ensureLoaded(IoCommands.MainAltSwitch())
			},
		},

		[CommonActions.SetScribbleLight]: {
			name: 'Set Scribble Light',
			description: 'Set or toggle the scribble light state of a channel, aux, bus, dca, matrix, or main.',
			options: [
				...GetDropdownWithVariables('Selection', 'sel', [...allChannels, ...state.namedChoices.dcas]),
				...GetOnOffToggleDropdownWithVariables('led', 'Scribble Light', true),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const led = ActionUtil.getNumberWithVariables(event, 'led')
				const cmd = ActionUtil.getScribblelightCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				await send(cmd, led)
			},
		},
		[CommonActions.SetScribbleLightColor]: {
			name: 'Set Scribble Light Color',
			description: 'Set the scribble light color of a channel, aux, bus, dca, matrix, or main.',
			options: [
				...GetDropdownWithVariables('Selection', 'sel', [...allChannels, ...state.namedChoices.dcas]),
				GetColorDropdown('color', 'Color'),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getColorCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				await send(cmd, ActionUtil.getNumber(event, 'color'))
			},
		},
		[CommonActions.SetName]: {
			name: 'Set Name',
			description: 'Set the name of a channel, aux, bus, dca, matrix, main, or a mutegroup.',
			options: [
				...GetDropdownWithVariables('Selection', 'sel', [
					...allChannels,
					...state.namedChoices.dcas,
					...state.namedChoices.mutegroups,
				]),
				...GetTextFieldWithVariables('Name', 'name'),
			],
			callback: async (event) => {
				const name = ActionUtil.getStringWithVariables(event, 'name')
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getNameCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				await send(cmd, name)
			},
		},
		[CommonActions.SetIcon]: {
			name: 'Set Channel Icon',
			description: 'Set the icon displayed for a channel.',
			options: [
				...GetDropdownWithVariables('Selection', 'sel', [...allChannels, ...state.namedChoices.dcas]),
				...GetDropdownWithVariables('Icon', 'icon', getIconChoices()),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const icon = ActionUtil.getNumberWithVariables(event, 'icon')
				const cmd = ActionUtil.getIconCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				await send(cmd, icon)
			},
		},
		////////////////////////////////////////////////////////////////
		// Gain
		////////////////////////////////////////////////////////////////
		[CommonActions.SetGain]: {
			name: 'Set Gain',
			description: 'Set the input gain of a channel or aux.',
			options: [
				...GetDropdownWithVariables('Channel', 'sel', [...state.namedChoices.channels, ...state.namedChoices.auxes]),
				...GetNumberFieldWithVariables('Gain (dB)', 'gain', -3.0, 45.5, 0.5, 0),
				...FadeDurationChoice(),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const gain = ActionUtil.getNumberWithVariables(event, 'gain')
				const cmd = ActionUtil.getGainCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				ActionUtil.runTransition(cmd, 'gain', event, state, transitions, gain, false)
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getGainCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				ensureLoaded(cmd)
			},
			learn: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getGainCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				return { gain: StateUtil.getNumberFromState(cmd, state), gain_use_variables: false }
			},
		},
		[CommonActions.StoreGain]: {
			name: 'Store Gain',
			description: 'Store the gain of a channel or aux.',
			options: [...GetDropdownWithVariables('Selection', 'sel', allChannels)],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getGainCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				StateUtil.storeValueForCommand(cmd, state)
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getGainCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				ensureLoaded(cmd)
			},
		},
		[CommonActions.RestoreGain]: {
			name: 'Restore Gain',
			description: 'Restore the gain of a channel or aux.',
			options: [...GetDropdownWithVariables('Selection', 'sel', allChannels), ...FadeDurationChoice()],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getGainCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				const restoreVal = StateUtil.getValueFromKey(cmd, state)
				ActionUtil.runTransition(cmd, 'gain', event, state, transitions, restoreVal, false)
			},
		},
		[CommonActions.DeltaGain]: {
			name: 'Adjust Gain',
			description: 'Adjust the input gain of a channel or aux.',
			options: [
				...GetDropdownWithVariables('Selection', 'sel', allChannels),
				...GetNumberFieldWithVariables('Gain (dB)', 'gain', -48.5, 48.5, 0.5, 0),
				...FadeDurationChoice(),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getGainCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				let targetValue = StateUtil.getNumberFromState(cmd, state)
				const delta = ActionUtil.getNumberWithVariables(event, 'gain')
				state.storeDelta(cmd, delta)
				if (targetValue != undefined) {
					targetValue += delta
					ActionUtil.runTransition(cmd, 'gain', event, state, transitions, targetValue, false)
				}
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getGainCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				ensureLoaded(cmd)
			},
		},
		[CommonActions.UndoDeltaGain]: {
			name: 'Undo Gain Adjust',
			description: 'Undo the previous input gain adjustment on a channel or aux.',
			options: [...GetDropdownWithVariables('Selection', 'sel', allChannels), ...FadeDurationChoice()],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getGainCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				let targetValue = StateUtil.getNumberFromState(cmd, state)
				const delta = state.restoreDelta(cmd)
				if (targetValue != undefined) {
					targetValue -= delta
					ActionUtil.runTransition(cmd, 'gain', event, state, transitions, targetValue, false)
				}
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getGainCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				ensureLoaded(cmd)
			},
		},
		////////////////////////////////////////////////////////////////
		// NORMAL
		////////////////////////////////////////////////////////////////
		[CommonActions.SetMute]: {
			name: 'Set Mute',
			description: 'Set or toggle the mute state of a channel, aux, bus, dca, matrix or main.',
			options: [
				...GetDropdownWithVariables('Selection', 'sel', [
					...allChannels,
					...state.namedChoices.dcas,
					...state.namedChoices.mutegroups,
				]),
				...GetMuteDropdownWithVariables('mute', 'Mute', true),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const mute = ActionUtil.getNumberWithVariables(event, 'mute')
				const cmd = ActionUtil.getMuteCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				await send(cmd, mute)
			},
		},
		////////////////////////////////////////////////////////////////
		// Fader
		////////////////////////////////////////////////////////////////
		[CommonActions.SetFader]: {
			name: 'Set Level',
			description: 'Set the fader level of a channel, aux, bus, dca, matrix or main to a value.',
			options: [
				...GetDropdownWithVariables('Selection', 'sel', [...allChannels, ...state.namedChoices.dcas]),
				...GetFaderInputFieldWithVariables('level'),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const level = ActionUtil.getNumberWithVariables(event, 'level')
				const cmd = ActionUtil.getFaderCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				runTransition(cmd, 'level', event, state, transitions, level)
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getFaderCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				ensureLoaded(cmd)
			},
			learn: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getFaderCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				return { level: StateUtil.getNumberFromState(cmd, state), level_use_variables: false }
			},
		},
		[CommonActions.StoreFader]: {
			name: 'Store Level',
			description: 'Store the fader level of a channel, aux, bus, dca, matrix or main.',
			options: [...GetDropdownWithVariables('Selection', 'sel', [...allChannels, ...state.namedChoices.dcas])],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getFaderCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				StateUtil.storeValueForCommand(cmd, state)
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getFaderCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				ensureLoaded(cmd)
			},
		},
		[CommonActions.RestoreFader]: {
			name: 'Restore Level',
			description: 'Restore the fader level of a channel, aux, bus, dca, matrix or main.',
			options: [
				...GetDropdownWithVariables('Selection', 'sel', [...allChannels, ...state.namedChoices.dcas]),
				...FadeDurationChoice(),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getFaderCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				const restoreVal = StateUtil.getValueFromKey(cmd, state)
				ActionUtil.runTransition(cmd, 'level', event, state, transitions, restoreVal)
			},
		},
		[CommonActions.DeltaFader]: {
			name: 'Adjust Fader Level',
			description: 'Adjust the level of a channel, aux, bus, dca, matrix or main.',
			options: [
				...GetDropdownWithVariables('Selection', 'sel', [...allChannels, ...state.namedChoices.dcas]),
				...GetFaderDeltaInputFieldWithVariables('delta', 'Adjust'),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getFaderCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				let targetValue = StateUtil.getNumberFromState(cmd, state)
				const usePercentage = event.options.delta_use_percentage as boolean
				let delta: number
				if (usePercentage) {
					const useVariables = event.options.delta_use_variables as boolean
					if (useVariables) {
						delta = Number(event.options.delta_percent_variables) / 100
					} else {
						delta = Number(event.options.delta_percent) / 100
					}
				} else {
					delta = ActionUtil.getNumberWithVariables(event, 'delta')
				}
				state.storeDelta(cmd, delta)
				if (targetValue != undefined) {
					if (!usePercentage && targetValue < -90) {
						targetValue = -90
					}
					targetValue += delta
					ActionUtil.runTransition(cmd, 'level', event, state, transitions, targetValue, !usePercentage)
				}
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getFaderCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				ensureLoaded(cmd)
			},
		},
		[CommonActions.UndoDeltaFader]: {
			name: 'Undo Level Adjust',
			description: 'Undo the previous level adjustment on a channel, aux, bus, dca, matrix or main.',
			options: [
				...GetDropdownWithVariables('Selection', 'sel', [...allChannels, ...state.namedChoices.dcas]),
				...FadeDurationChoice(),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getFaderCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				let targetValue = StateUtil.getNumberFromState(cmd, state)
				const delta = state.restoreDelta(cmd)
				if (targetValue != undefined) {
					targetValue -= delta
					ActionUtil.runTransition(cmd, 'level', event, state, transitions, targetValue)
				}
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getFaderCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				ensureLoaded(cmd)
			},
		},

		////////////////////////////////////////////////////////////////
		// Panorama
		////////////////////////////////////////////////////////////////
		[CommonActions.SetPanorama]: {
			name: 'Set Panorama',
			description: 'Set the panorama of a channel, aux, bus, matrix or main.',
			options: [...GetDropdownWithVariables('Selection', 'sel', allChannels), ...GetPanoramaSliderWithVariables('pan')],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const pan = ActionUtil.getNumberWithVariables(event, 'pan')
				const cmd = ActionUtil.getPanoramaCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				runTransition(cmd, 'pan', event, state, transitions, pan, false)
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getPanoramaCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				ensureLoaded(cmd)
			},
			learn: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getPanoramaCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				return { pan: StateUtil.getNumberFromState(cmd, state), pan_use_variables: false }
			},
		},
		[CommonActions.StorePanorama]: {
			name: 'Store Panorama',
			description: 'Store the panorama of a channel, aux, bus, matrix or main.',
			options: [...GetDropdownWithVariables('Selection', 'sel', allChannels)],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getPanoramaCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				StateUtil.storeValueForCommand(cmd, state)
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getPanoramaCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				ensureLoaded(cmd)
			},
		},
		[CommonActions.RestorePanorama]: {
			name: 'Restore Panorama',
			description: 'Restore the panorama of a channel, aux, bus, matrix or main.',
			options: [...GetDropdownWithVariables('Selection', 'sel', allChannels), ...FadeDurationChoice()],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getPanoramaCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				const restoreVal = StateUtil.getValueFromKey(cmd, state)
				ActionUtil.runTransition(cmd, 'pan', event, state, transitions, restoreVal, false)
			},
		},
		[CommonActions.DeltaPanorama]: {
			name: 'Adjust Panorama',
			description: 'Adjust the panorama of a channel, aux, bus, matrix or main.',
			options: [
				...GetDropdownWithVariables('Selection', 'sel', allChannels),
				...GetPanoramaDeltaSliderWithVariables('pan', 'Panorama'),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getPanoramaCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				let targetValue = StateUtil.getNumberFromState(cmd, state)
				const delta = ActionUtil.getNumberWithVariables(event, 'pan')
				state.storeDelta(cmd, delta)
				if (targetValue != undefined) {
					targetValue += delta
					ActionUtil.runTransition(cmd, 'pan', event, state, transitions, targetValue, false)
				}
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getPanoramaCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				ensureLoaded(cmd)
			},
		},
		[CommonActions.UndoDeltaPanorama]: {
			name: 'Undo Panorama Adjust',
			description: 'Undo the previous adjustment on the panorama of a channel, aux, bus, matrix or main.',
			options: [...GetDropdownWithVariables('Selection', 'sel', allChannels), ...FadeDurationChoice()],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getPanoramaCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				let targetValue = StateUtil.getNumberFromState(cmd, state)
				const delta = state.restoreDelta(cmd)
				if (targetValue != undefined) {
					targetValue -= delta
					ActionUtil.runTransition(cmd, 'pan', event, state, transitions, targetValue, false)
				}
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getPanoramaCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				ensureLoaded(cmd)
			},
		},
		////////////////////////////////////////////////////////////////
		// Solo
		////////////////////////////////////////////////////////////////
		[CommonActions.SetSolo]: {
			name: 'Set Solo',
			description: 'Set the solo state for a channel, aux, bux, matrix or main',
			options: [
				...GetDropdownWithVariables('Selection', 'sel', [...allChannels, ...state.namedChoices.dcas]),
				...GetOnOffToggleDropdownWithVariables('solo', 'Solo', true),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const solo = ActionUtil.getNumberWithVariables(event, 'solo')
				const cmd = ActionUtil.getSoloCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				await send(cmd, solo)
			},
		},
		[CommonActions.ClearSolo]: {
			name: 'Clear Solo',
			description: 'Clear the Solo from all channels, auxes, busses, matrices and mains.',
			options: [],
			callback: async (_) => {
				const extractNumber = (id: string): number | null => {
					const match = id.match(/\/(\d+)$/)
					return match ? parseInt(match[1], 10) : null
				}

				for (const channel of allChannels) {
					const id = channel.id as string
					const number = extractNumber(id)
					if (number !== null) {
						const cmd = ActionUtil.getSoloCommand(id, number)
						await send(cmd, 0)
					}
				}
			},
		},
		////////////////////////////////////////////////////////////////
		// Delay
		////////////////////////////////////////////////////////////////
		[CommonActions.SetDelay]: {
			name: 'Set Delay',
			description: 'Enable or disable the delay of a channel, bus, matrix or main.',
			options: [
				...GetDropdownWithVariables('Selection', 'sel', [
					...state.namedChoices.channels,
					...state.namedChoices.matrices,
					...state.namedChoices.busses,
					...state.namedChoices.mains,
				]),
				...GetOnOffToggleDropdownWithVariables('delay', 'Delay', true),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getDelayOnCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				const delay = ActionUtil.getNumberWithVariables(event, 'delay')
				await send(cmd, delay)
			},
		},

		[CommonActions.SetDelayAmount]: {
			name: 'Set Delay Mode',
			description: 'Set the delay mode of a channel, bus, matrix or main.',
			options: [
				...GetDropdownWithVariables('Selection', 'sel', [
					...state.namedChoices.channels,
					...state.namedChoices.matrices,
					...state.namedChoices.busses,
					...state.namedChoices.mains,
				]),
				GetDropdown('Delay Mode', 'mode', getDelayModes()),
				...GetNumberFieldWithVariables('Amount (meters)', 'amount_m', 0, 150, 0.1, 0, '', `$(options:mode) == 'M'`),
				...GetNumberFieldWithVariables('Amount (ft)', 'amount_ft', 0.5, 500, 0.5, 0.5, '', `$(options:mode) == 'FT'`),
				...GetNumberFieldWithVariables('Amount (ms)', 'amount_ms', 0.5, 500, 0.1, 0.5, '', `$(options:mode) == 'MS'`),
				...GetNumberFieldWithVariables(
					'Amount (samples)',
					'amount_samples',
					16,
					500,
					1,
					16,
					'',
					`$(options:mode) == 'SMP'`,
				),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const mode = ActionUtil.getStringWithVariables(event, 'mode')
				await send(ActionUtil.getDelayModeCommand(sel, ActionUtil.getNodeNumberFromID(sel)), mode)
				switch (mode) {
					case 'M':
						await send(
							ActionUtil.getDelayAmountCommand(sel, ActionUtil.getNodeNumberFromID(sel)),
							event.options.amount_m as number,
							true,
						)
						break
					case 'FT':
						await send(
							ActionUtil.getDelayAmountCommand(sel, ActionUtil.getNodeNumberFromID(sel)),
							event.options.amount_ft as number,
							true,
						)
						break
					case 'MS':
						await send(
							ActionUtil.getDelayAmountCommand(sel, ActionUtil.getNodeNumberFromID(sel)),
							event.options.amount_ms as number,
							true,
						)
						break
					case 'SMP':
						await send(
							ActionUtil.getDelayAmountCommand(sel, ActionUtil.getNodeNumberFromID(sel)),
							event.options.amount_samples as number,
							true,
						)
						break
				}
			},
		},
		////////////////////////////////////////////////////////////////
		// Gate
		////////////////////////////////////////////////////////////////
		[CommonActions.SetGateOn]: {
			name: 'Set Gate On',
			description: 'Enable, disable or toggle the on-state of a gate on a channel',
			options: [
				...GetDropdownWithVariables('Selection', 'sel', state.namedChoices.channels),
				...GetOnOffToggleDropdownWithVariables('enable', 'Enable', true),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const enable = ActionUtil.getNumberWithVariables(event, 'enable')
				const cmd = ActionUtil.getGateEnableCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				await send(cmd, enable)
			},
		},
		////////////////////////////////////////////////////////////////
		// EQ
		////////////////////////////////////////////////////////////////
		[CommonActions.SetEqOn]: {
			name: 'Set EQ On',
			description: 'Enable, disable or toggle the on-state of an EQ on a channel, bus, aux, matrix or main.',
			options: [
				...GetDropdownWithVariables('Selection', 'sel', allChannels),
				...GetOnOffToggleDropdownWithVariables('enable', 'Enable', true),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getEqEnableCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				const enable = ActionUtil.getNumberWithVariables(event, 'enable')
				await send(cmd, enable)
			},
		},
		////////////////////////////////////////////////////////////////
		// Dynamics
		////////////////////////////////////////////////////////////////
		[CommonActions.SetDynamicsOn]: {
			name: 'Set Dynamics On',
			description: 'Enable, disable or toggle the on-state of dynamics on a channel, bus, aux, matrix or main.',
			options: [
				...GetDropdownWithVariables('Selection', 'sel', allChannels),
				...GetOnOffToggleDropdownWithVariables('enable', 'Enable', true),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getDynamicsEnableCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				const enable = ActionUtil.getNumberWithVariables(event, 'enable')
				await send(cmd, enable)
			},
		},
		////////////////////////////////////////////////////////////////
		// Send Fader
		////////////////////////////////////////////////////////////////
		[CommonActions.SetSendFader]: {
			name: 'Set Send Level',
			description: 'Set the send level from a destination channel strip to a source',
			options: [
				...GetSendSourceDestinationFieldsWithVariables(
					allSendSources,
					channelAuxBusSendDestinations,
					mainSendDestinations,
				),
				...GetFaderInputFieldWithVariables('level'),
			],
			callback: async (event) => {
				const { src, dest } = ActionUtil.GetSendSourceDestinationFieldsWithVariables(event)
				const level = ActionUtil.getNumberWithVariables(event, 'level')
				const cmd = ActionUtil.getSendLevelCommand(src, dest)
				runTransition(cmd, 'level', event, state, transitions, level)
			},
			subscribe: (event) => {
				const { src, dest } = ActionUtil.GetSendSourceDestinationFieldsWithVariables(event)
				const cmd = ActionUtil.getSendLevelCommand(src, dest)
				ensureLoaded(cmd)
			},
		},
		[CommonActions.StoreSendFader]: {
			name: 'Store Send Level',
			description: 'Store the send level from a destination channel strip to a source',
			options: [
				...GetSendSourceDestinationFieldsWithVariables(
					allSendSources,
					channelAuxBusSendDestinations,
					mainSendDestinations,
				),
			],
			callback: async (event) => {
				const { src, dest } = ActionUtil.GetSendSourceDestinationFieldsWithVariables(event)
				const cmd = ActionUtil.getSendLevelCommand(src, dest)
				StateUtil.storeValueForCommand(cmd, state)
			},
			subscribe: (event) => {
				const { src, dest } = ActionUtil.GetSendSourceDestinationFieldsWithVariables(event)
				const cmd = ActionUtil.getSendLevelCommand(src, dest)
				ensureLoaded(cmd)
			},
		},
		[CommonActions.RestoreSendFader]: {
			name: 'Restore Send Level',
			description: 'Restore the send level from a destination channel strip to a source',
			options: [
				...GetSendSourceDestinationFieldsWithVariables(
					allSendSources,
					channelAuxBusSendDestinations,
					mainSendDestinations,
				),
				...FadeDurationChoice(),
			],
			callback: async (event) => {
				const { src, dest } = ActionUtil.GetSendSourceDestinationFieldsWithVariables(event)
				const cmd = ActionUtil.getSendLevelCommand(src, dest)
				const restoreVal = StateUtil.getValueFromKey(cmd, state)
				ActionUtil.runTransition(cmd, 'level', event, state, transitions, restoreVal)
			},
		},
		[CommonActions.DeltaSendFader]: {
			name: 'Adjust Send Level',
			description: 'Adjust the send level from a destination channel strip to a source',
			options: [
				...GetSendSourceDestinationFieldsWithVariables(
					allSendSources,
					channelAuxBusSendDestinations,
					mainSendDestinations,
				),
				...GetFaderDeltaInputFieldWithVariables('delta', 'Adjust'),
			],
			callback: async (event) => {
				const { src, dest } = ActionUtil.GetSendSourceDestinationFieldsWithVariables(event)
				const cmd = ActionUtil.getSendLevelCommand(src, dest)
				let targetValue = StateUtil.getNumberFromState(cmd, state)
				const usePercentage = event.options.delta_use_percentage as boolean
				let delta: number
				if (usePercentage) {
					const useVariables = event.options.delta_use_variables as boolean
					if (useVariables) {
						delta = Number(event.options.delta_percent_variables) / 100
					} else {
						delta = Number(event.options.delta_percent) / 100
					}
				} else {
					delta = ActionUtil.getNumberWithVariables(event, 'delta')
				}
				state.storeDelta(cmd, delta)
				if (targetValue != undefined) {
					if (!usePercentage && targetValue < -90) {
						targetValue = -90
					}
					targetValue += delta
					ActionUtil.runTransition(cmd, 'level', event, state, transitions, targetValue, !usePercentage)
				}
			},
			subscribe: (event) => {
				const { src, dest } = ActionUtil.GetSendSourceDestinationFieldsWithVariables(event)
				const cmd = ActionUtil.getSendLevelCommand(src, dest)
				ensureLoaded(cmd)
			},
		},
		[CommonActions.UndoDeltaSendFader]: {
			name: 'Undo Send Level Adjust',
			description: 'Undo the previous send level adjustment from a destination channel strip to a source',
			options: [
				...GetSendSourceDestinationFieldsWithVariables(
					allSendSources,
					channelAuxBusSendDestinations,
					mainSendDestinations,
				),
				...FadeDurationChoice(),
			],
			callback: async (event) => {
				const { src, dest } = ActionUtil.GetSendSourceDestinationFieldsWithVariables(event)
				const cmd = ActionUtil.getSendLevelCommand(src, dest)
				let targetValue = StateUtil.getNumberFromState(cmd, state)
				const delta = state.restoreDelta(cmd)
				if (targetValue != undefined) {
					targetValue -= delta
					ActionUtil.runTransition(cmd, 'level', event, state, transitions, targetValue)
				}
			},
			subscribe: (event) => {
				const { src, dest } = ActionUtil.GetSendSourceDestinationFieldsWithVariables(event)
				const cmd = ActionUtil.getSendLevelCommand(src, dest)
				ensureLoaded(cmd)
			},
		},
		[CommonActions.SetSendMute]: {
			name: 'Set Send Mute',
			description: 'Set or toggle the mute state of a send from a destination channel strip to a source',
			options: [
				...GetSendSourceDestinationFieldsWithVariables(
					allSendSources,
					channelAuxBusSendDestinations,
					mainSendDestinations,
				),
				...GetMuteDropdownWithVariables('mute', 'Mute', true),
			],
			callback: async (event) => {
				const { src, dest } = ActionUtil.GetSendSourceDestinationFieldsWithVariables(event)
				const cmd = ActionUtil.getSendMuteCommand(src, dest)
				let val = ActionUtil.getNumberWithVariables(event, 'mute')
				// Mute states are inverted for sends
				if (val != -1) {
					val = val == 0 ? 1 : 0
				}
				await send(cmd, val)
			},
		},
		////////////////////////////////////////////////////////////////
		// Send Panorama
		////////////////////////////////////////////////////////////////
		[CommonActions.SetSendPanorama]: {
			name: 'Set Send Panorama',
			description: 'Set the panorama of a send from a channel or aux to a bus or matrix.',
			options: [
				...GetDropdownWithVariables('From', 'src', [...state.namedChoices.channels, ...state.namedChoices.auxes]),
				...GetDropdownWithVariables('To', 'dest', [...state.namedChoices.busses, ...state.namedChoices.matrices]),
				...GetPanoramaSliderWithVariables('pan'),
			],
			callback: async (event) => {
				const src = ActionUtil.getStringWithVariables(event, 'src')
				const dest = ActionUtil.getStringWithVariables(event, 'dest')
				const pan = ActionUtil.getNumberWithVariables(event, 'pan')
				const cmd = ActionUtil.getSendPanoramaCommand(src, dest)
				runTransition(cmd, 'pan', event, state, transitions, pan, false)
			},
			subscribe: (event) => {
				const src = ActionUtil.getStringWithVariables(event, 'src')
				const dest = ActionUtil.getStringWithVariables(event, 'dest')
				const cmd = ActionUtil.getSendPanoramaCommand(src, dest)
				ensureLoaded(cmd)
			},
			learn: async (event) => {
				const src = ActionUtil.getStringWithVariables(event, 'src')
				const dest = ActionUtil.getStringWithVariables(event, 'dest')
				const cmd = ActionUtil.getSendPanoramaCommand(src, dest)
				return { pan: StateUtil.getNumberFromState(cmd, state), pan_use_variables: false }
			},
		},
		[CommonActions.StoreSendPanorama]: {
			name: 'Store Send Panorama',
			description: 'Store the panorama of a send from a channel or aux to a bus or matrix.',
			options: [
				...GetDropdownWithVariables('From', 'src', [...state.namedChoices.channels, ...state.namedChoices.auxes]),
				...GetDropdownWithVariables('To', 'dest', [...state.namedChoices.busses, ...state.namedChoices.matrices]),
			],
			callback: async (event) => {
				const src = ActionUtil.getStringWithVariables(event, 'src')
				const dest = ActionUtil.getStringWithVariables(event, 'dest')
				const cmd = ActionUtil.getSendPanoramaCommand(src, dest)
				StateUtil.storeValueForCommand(cmd, state)
			},
			subscribe: (event) => {
				const src = ActionUtil.getStringWithVariables(event, 'src')
				const dest = ActionUtil.getStringWithVariables(event, 'dest')
				const cmd = ActionUtil.getSendPanoramaCommand(src, dest)
				ensureLoaded(cmd)
			},
		},
		[CommonActions.RestoreSendPanorama]: {
			name: 'Restore Send Panorama',
			description: 'Restore the panorama of a send from a channel or aux to a bus or matrix.',
			options: [
				...GetDropdownWithVariables('From', 'src', [...state.namedChoices.channels, ...state.namedChoices.auxes]),
				...GetDropdownWithVariables('To', 'dest', [...state.namedChoices.busses, ...state.namedChoices.matrices]),
				...FadeDurationChoice(),
			],
			callback: async (event) => {
				const src = ActionUtil.getStringWithVariables(event, 'src')
				const dest = ActionUtil.getStringWithVariables(event, 'dest')
				const cmd = ActionUtil.getSendPanoramaCommand(src, dest)
				const restoreVal = StateUtil.getValueFromKey(cmd, state)
				ActionUtil.runTransition(cmd, 'pan', event, state, transitions, restoreVal, false)
			},
		},
		[CommonActions.DeltaSendPanorama]: {
			name: 'Adjust Send Panorama',
			description: 'Adjust the panorama of a send from a channel or aux to a bus or matrix.',
			options: [
				...GetDropdownWithVariables('From', 'src', [...state.namedChoices.channels, ...state.namedChoices.auxes]),
				...GetDropdownWithVariables('To', 'dest', [...state.namedChoices.busses, ...state.namedChoices.matrices]),
				...GetPanoramaDeltaSliderWithVariables('delta', 'Panorama'),
			],
			callback: async (event) => {
				const src = ActionUtil.getStringWithVariables(event, 'src')
				const dest = ActionUtil.getStringWithVariables(event, 'dest')
				const cmd = ActionUtil.getSendPanoramaCommand(src, dest)
				let targetValue = StateUtil.getNumberFromState(cmd, state)
				const delta = ActionUtil.getNumberWithVariables(event, 'delta')
				state.storeDelta(cmd, delta)
				if (targetValue != undefined) {
					targetValue += delta
					ActionUtil.runTransition(cmd, 'pan', event, state, transitions, targetValue, false)
				}
			},
			subscribe: (event) => {
				const src = ActionUtil.getStringWithVariables(event, 'src')
				const dest = ActionUtil.getStringWithVariables(event, 'dest')
				const cmd = ActionUtil.getSendPanoramaCommand(src, dest)
				ensureLoaded(cmd)
			},
		},
		[CommonActions.UndoDeltaSendPanorama]: {
			name: 'Undo Send Panorama Adjust',
			description: 'Undo the panorama adjustment of a send from a channel or aux to a bus or matrix.',
			options: [
				...GetDropdownWithVariables('From', 'src', [...state.namedChoices.channels, ...state.namedChoices.auxes]),
				...GetDropdownWithVariables('To', 'dest', [...state.namedChoices.busses, ...state.namedChoices.matrices]),
				...FadeDurationChoice(),
			],
			callback: async (event) => {
				const src = ActionUtil.getStringWithVariables(event, 'src')
				const dest = ActionUtil.getStringWithVariables(event, 'dest')
				const cmd = ActionUtil.getSendPanoramaCommand(src, dest)
				let targetValue = StateUtil.getNumberFromState(cmd, state)
				const delta = state.restoreDelta(cmd)
				if (targetValue != undefined) {
					targetValue -= delta
					ActionUtil.runTransition(cmd, 'pan', event, state, transitions, targetValue, false)
				}
			},
			subscribe: (event) => {
				const src = ActionUtil.getStringWithVariables(event, 'src')
				const dest = ActionUtil.getStringWithVariables(event, 'dest')
				const cmd = ActionUtil.getSendPanoramaCommand(src, dest)
				ensureLoaded(cmd)
			},
		},
		[CommonActions.SetInsertOn]: {
			name: 'Set Insert On',
			description: 'Enable or disable an insert for a channel, aux, bus, matrix or main.',
			options: [
				...GetDropdownWithVariables('Insert', 'insert', [
					getIdLabelPair('pre', 'Pre-Insert'),
					getIdLabelPair('post', 'Post-Insert'),
					getIdLabelPair('pre-post', 'Both'),
				]),
				...GetDropdownWithVariables('Selection', 'sel', [...allChannels]),
				...GetOnOffToggleDropdownWithVariables('enable', 'Enable', true),
			],
			callback: async (event) => {
				const insert = ActionUtil.getStringWithVariables(event, 'insert')
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const val = ActionUtil.getNumberWithVariables(event, 'enable')
				const nodeNum = ActionUtil.getNodeNumberFromID(sel)
				if (insert.includes('pre')) {
					const cmd = ActionUtil.getPreInsertOnCommand(sel, nodeNum)
					const currentVal = StateUtil.getBooleanFromState(cmd, state)
					if (val < 2) {
						await send(cmd, val)
					} else {
						await send(cmd, Number(!currentVal))
					}
				}
				if (insert.includes('post')) {
					const cmd = ActionUtil.getPostInsertCommand(sel, nodeNum)
					if (cmd == '') return // if an aux is requested
					const currentVal = StateUtil.getBooleanFromState(cmd, state)
					if (val < 2) {
						await send(cmd, val)
					} else {
						await send(cmd, Number(!currentVal))
					}
				}
			},
			subscribe: (event) => {
				const insert = ActionUtil.getStringWithVariables(event, 'insert')
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const nodeNum = ActionUtil.getNodeNumberFromID(sel)
				if (insert.includes('pre')) {
					const cmd = ActionUtil.getPreInsertOnCommand(sel, nodeNum)
					ensureLoaded(cmd)
				}
				if (insert.includes('post')) {
					const cmd = ActionUtil.getPreInsertOnCommand(sel, nodeNum)
					ensureLoaded(cmd)
				}
			},
		},

		////////////////////////////////////////////////////////////////
		// Monitor engineer tools
		////////////////////////////////////////////////////////////////

		[CommonActions.SetPhaseInvert]: {
			name: 'Set Phase Invert',
			description: 'Flip the polarity of a channel or strip input. Useful for mic phase alignment during soundcheck.',
			options: [
				...GetDropdownWithVariables('Strip', 'sel', [...allChannels]),
				...GetOnOffToggleDropdownWithVariables('invert', 'Phase Invert', true),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const val = ActionUtil.getNumberWithVariables(event, 'invert')
				const cmd = ActionUtil.getPhaseInvertCommand(sel)
				if (cmd === '') return
				if (val === -1) {
					const current = StateUtil.getBooleanFromState(cmd, state)
					await send(cmd, Number(!current))
				} else {
					await send(cmd, val)
				}
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getPhaseInvertCommand(sel)
				if (cmd) ensureLoaded(cmd)
			},
		},

		[CommonActions.SetWidth]: {
			name: 'Set Stereo Width',
			description: 'Set the stereo width of a channel or strip (-150 = full mono, 0 = normal, 150 = full wide).',
			options: [
				...GetDropdownWithVariables('Strip', 'sel', [...allChannels]),
				...GetNumberFieldWithVariables('Width (%)', 'width', -150, 150, 1, 0),
				...FadeDurationChoice(),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const width = ActionUtil.getNumberWithVariables(event, 'width')
				const cmd = ActionUtil.getWidthCommand(sel)
				if (cmd === '') return
				runTransition(cmd, 'width', event, state, transitions, width, false)
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getWidthCommand(sel)
				if (cmd) ensureLoaded(cmd)
			},
		},

		[CommonActions.DeltaWidth]: {
			name: 'Adjust Stereo Width (Relative)',
			description: 'Nudge the stereo width up or down. Use with encoder knobs on StreamDeck+.',
			options: [
				...GetDropdownWithVariables('Strip', 'sel', [...allChannels]),
				...GetNumberFieldWithVariables('Step (%)', 'step', -300, 300, 1, 10, 'Positive = wider, negative = narrower'),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const step = ActionUtil.getNumberWithVariables(event, 'step')
				const cmd = ActionUtil.getWidthCommand(sel)
				if (cmd === '') return
				const current = StateUtil.getNumberFromState(cmd, state) ?? 0
				const newVal = Math.max(-150, Math.min(150, current + step))
				await send(cmd, newVal)
				state.set(cmd, [{ type: 'f', value: newVal }])
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getWidthCommand(sel)
				if (cmd) ensureLoaded(cmd)
			},
		},

		[CommonActions.SetSendMode]: {
			name: 'Set Bus Send Mode',
			description:
				'Set a channel send to a bus as PRE-fader, POST-fader, or Group (GRP). Core monitor engineering action.',
			options: [
				...GetDropdownWithVariables('From', 'src', [
					...state.namedChoices.channels,
					...state.namedChoices.auxes,
					...state.namedChoices.busses,
				]),
				...GetDropdownWithVariables('To Bus', 'dest', [...state.namedChoices.busses]),
				...GetDropdownWithVariables('Mode', 'mode', [
					{ id: 'PRE', label: 'PRE (pre-fader)' },
					{ id: 'POST', label: 'POST (post-fader)' },
					{ id: 'GRP', label: 'GRP (group)' },
				]),
			],
			callback: async (event) => {
				const src = ActionUtil.getStringWithVariables(event, 'src')
				const dest = ActionUtil.getStringWithVariables(event, 'dest')
				const mode = ActionUtil.getStringWithVariables(event, 'mode')
				const cmd = ActionUtil.getSendModeCommand(src, dest)
				if (cmd === '') return
				await send(cmd, mode)
				state.set(cmd, [{ type: 's', value: mode }])
			},
			subscribe: (event) => {
				const src = ActionUtil.getStringWithVariables(event, 'src')
				const dest = ActionUtil.getStringWithVariables(event, 'dest')
				const cmd = ActionUtil.getSendModeCommand(src, dest)
				if (cmd) ensureLoaded(cmd)
			},
		},

		////////////////////////////////////////////////////////////////
		// Trim
		////////////////////////////////////////////////////////////////

		[CommonActions.SetTrim]: {
			name: 'Set Input Trim',
			description: 'Set the input trim of a channel or aux strip.',
			options: [
				...GetDropdownWithVariables('Strip', 'sel', [...state.namedChoices.channels, ...state.namedChoices.auxes]),
				...GetNumberFieldWithVariables('Trim (dB)', 'trim', -18, 18, 0.5, 0, 'dB, range -18..18'),
				...FadeDurationChoice(),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const trim = ActionUtil.getNumberWithVariables(event, 'trim')
				const cmd = ActionUtil.getTrimCommand(sel)
				if (!cmd) return
				runTransition(cmd, 'trim', event, state, transitions, trim, false)
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getTrimCommand(sel)
				if (cmd) ensureLoaded(cmd)
			},
		},

		[CommonActions.AdjustTrim]: {
			name: 'Adjust Input Trim (Relative)',
			description: 'Nudge the input trim up or down by a step.',
			options: [
				...GetDropdownWithVariables('Strip', 'sel', [...state.namedChoices.channels, ...state.namedChoices.auxes]),
				...GetNumberFieldWithVariables(
					'Step (dB)',
					'step',
					-36,
					36,
					0.5,
					1,
					'Positive = increase, negative = decrease',
				),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const step = ActionUtil.getNumberWithVariables(event, 'step')
				const cmd = ActionUtil.getTrimCommand(sel)
				if (!cmd) return
				const current = StateUtil.getNumberFromState(cmd, state) ?? 0
				const newVal = Math.max(-18, Math.min(18, current + step))
				await send(cmd, newVal, true)
				state.set(cmd, [{ type: 'f', value: newVal }])
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getTrimCommand(sel)
				if (cmd) ensureLoaded(cmd)
			},
		},

		[CommonActions.ResetTrim]: {
			name: 'Reset Input Trim',
			description: 'Reset the input trim of a channel or aux strip to 0 dB.',
			options: [
				...GetDropdownWithVariables('Strip', 'sel', [...state.namedChoices.channels, ...state.namedChoices.auxes]),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getTrimCommand(sel)
				if (!cmd) return
				await send(cmd, 0.0, true)
				state.set(cmd, [{ type: 'f', value: 0 }])
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getTrimCommand(sel)
				if (cmd) ensureLoaded(cmd)
			},
		},

		////////////////////////////////////////////////////////////////
		// Mute groups
		////////////////////////////////////////////////////////////////

		[CommonActions.SetPhantomPower]: {
			name: 'Set Phantom Power',
			description: 'Enable, disable, or toggle phantom power (+48V) on a channel or aux strip.',
			options: [
				...GetDropdownWithVariables('Strip', 'sel', [...state.namedChoices.channels, ...state.namedChoices.auxes]),
				...GetOnOffToggleDropdownWithVariables('phantom', 'Phantom Power', true),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const val = ActionUtil.getNumberWithVariables(event, 'phantom')
				const cmd = ActionUtil.getPhantomPowerCommand(sel)
				if (!cmd) return
				if (val === -1) {
					const current = StateUtil.getBooleanFromState(cmd, state)
					await send(cmd, Number(!current))
					state.set(cmd, [{ type: 'i', value: Number(!current) }])
				} else {
					await send(cmd, val)
					state.set(cmd, [{ type: 'i', value: val }])
				}
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getPhantomPowerCommand(sel)
				if (cmd) ensureLoaded(cmd)
			},
		},

		[CommonActions.ReleaseAllMuteGroups]: {
			name: 'Release All Mute Groups',
			description: 'Unmute all mute groups (1-8) simultaneously.',
			options: [],
			callback: async (_event) => {
				for (let i = 1; i <= 8; i++) {
					const cmd = MuteGroupCommands.Mute(i)
					await send(cmd, 0)
					state.set(cmd, [{ type: 'i', value: 0 }])
				}
			},
		},

		////////////////////////////////////////////////////////////////
		// Reset channel
		////////////////////////////////////////////////////////////////

		[CommonActions.ResetChannel]: {
			name: 'Reset Channel',
			description:
				'Full reset: cut fader, unmute, zero trim/pan/width/phase-invert, bus and main sends to unity, EQ flat.',
			options: [
				...GetDropdownWithVariables('Strip', 'sel', [...state.namedChoices.channels, ...state.namedChoices.auxes]),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const num = ActionUtil.getNodeNumberFromID(sel)

				const faderCmd = ActionUtil.getFaderCommand(sel, num)
				if (faderCmd) {
					await send(faderCmd, -144, true)
					state.set(faderCmd, [{ type: 'f', value: -144 }])
				}

				const muteCmd = ActionUtil.getMuteCommand(sel, num)
				if (muteCmd) {
					await send(muteCmd, 0)
					state.set(muteCmd, [{ type: 'i', value: 0 }])
				}

				const trimCmd = ActionUtil.getTrimCommand(sel)
				if (trimCmd) {
					await send(trimCmd, 0, true)
					state.set(trimCmd, [{ type: 'f', value: 0 }])
				}

				const panCmd = ActionUtil.getPanoramaCommand(sel, num)
				if (panCmd) {
					await send(panCmd, 0, true)
					state.set(panCmd, [{ type: 'f', value: 0 }])
				}

				const widthCmd = ActionUtil.getWidthCommand(sel)
				if (widthCmd) {
					await send(widthCmd, 0, true)
					state.set(widthCmd, [{ type: 'f', value: 0 }])
				}

				const invCmd = ActionUtil.getPhaseInvertCommand(sel)
				if (invCmd) {
					await send(invCmd, 0)
					state.set(invCmd, [{ type: 'i', value: 0 }])
				}

				for (let i = 1; i <= 16; i++) {
					const lvlCmd = ActionUtil.getBusSendLevelCommand(sel, i)
					if (lvlCmd) {
						await send(lvlCmd, 0, true)
						state.set(lvlCmd, [{ type: 'f', value: 0 }])
					}
				}

				for (let i = 1; i <= 4; i++) {
					const lvlCmd = ActionUtil.getMainSendLevelCommand(sel, num, i)
					if (lvlCmd) {
						await send(lvlCmd, 0, true)
						state.set(lvlCmd, [{ type: 'f', value: 0 }])
					}
				}

				const eqNode = ActionUtil.getEqNode(sel)
				if (eqNode) {
					for (const band of ['l', '1', '2', '3', '4', 'h']) {
						await send(`${eqNode}/${band}g`, 0, true)
						state.set(`${eqNode}/${band}g`, [{ type: 'f', value: 0 }])
					}
				}
			},
		},

		////////////////////////////////////////////////////////////////
		// Headamp gain (IO-resolved)
		////////////////////////////////////////////////////////////////

		[CommonActions.SetHeadampGain]: {
			name: 'Set Headamp Gain',
			description:
				'Set the actual preamp gain on a channel or aux by resolving the IO source path at runtime. Range: −3 to 45.5 dB.',
			options: [
				...GetDropdownWithVariables('Channel', 'channel', [
					...state.namedChoices.channels,
					...state.namedChoices.auxes,
				]),
				...GetNumberFieldWithVariables('Gain (dB)', 'gain', -3, 45.5, 0.5, 0),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'channel')
				const gain = ActionUtil.getNumberWithVariables(event, 'gain')
				const grp = StateUtil.getStringFromState(ActionUtil.getMainInputConnectionGroupCommand(sel), state)
				const idx = StateUtil.getNumberFromState(ActionUtil.getMainInputConnectionIndexCommand(sel), state)
				if (!grp || idx === undefined) return
				await send(IoCommands.InputGain(grp, Math.round(idx)), Math.max(-3, Math.min(45.5, gain)), true)
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'channel')
				ensureLoaded(ActionUtil.getMainInputConnectionGroupCommand(sel))
				ensureLoaded(ActionUtil.getMainInputConnectionIndexCommand(sel))
			},
		},

		[CommonActions.AdjustHeadampGain]: {
			name: 'Adjust Headamp Gain (Relative)',
			description: 'Nudge the actual preamp gain up or down. Resolves the IO source path at runtime.',
			options: [
				...GetDropdownWithVariables('Channel', 'channel', [
					...state.namedChoices.channels,
					...state.namedChoices.auxes,
				]),
				...GetNumberFieldWithVariables(
					'Step (dB)',
					'step',
					-48,
					48,
					0.5,
					3,
					'Positive = increase, negative = decrease',
				),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'channel')
				const step = ActionUtil.getNumberWithVariables(event, 'step')
				const grp = StateUtil.getStringFromState(ActionUtil.getMainInputConnectionGroupCommand(sel), state)
				const idx = StateUtil.getNumberFromState(ActionUtil.getMainInputConnectionIndexCommand(sel), state)
				if (!grp || idx === undefined) return
				const gainCmd = IoCommands.InputGain(grp, Math.round(idx))
				const current = StateUtil.getNumberFromState(gainCmd, state) ?? 0
				const newGain = Math.max(-3, Math.min(45.5, current + step))
				await send(gainCmd, newGain, true)
				state.set(gainCmd, [{ type: 'f', value: newGain }])
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'channel')
				ensureLoaded(ActionUtil.getMainInputConnectionGroupCommand(sel))
				ensureLoaded(ActionUtil.getMainInputConnectionIndexCommand(sel))
			},
		},

		////////////////////////////////////////////////////////////////
		// Input patching
		////////////////////////////////////////////////////////////////

		[CommonActions.SetInputPatch]: {
			name: 'Set Input Patch',
			description: 'Repatch a channel or aux to a different physical input source (sets both source group and index).',
			options: [
				...GetDropdownWithVariables('Channel', 'channel', [
					...state.namedChoices.channels,
					...state.namedChoices.auxes,
				]),
				...GetDropdownWithVariables('Source Group', 'grp', getSourceGroupChoices()),
				...GetNumberFieldWithVariables('Source Index', 'idx', 1, 64, 1, 1),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'channel')
				const grp = ActionUtil.getStringWithVariables(event, 'grp')
				const idx = ActionUtil.getNumberWithVariables(event, 'idx')
				await send(ActionUtil.getMainInputConnectionGroupCommand(sel), grp)
				await send(ActionUtil.getMainInputConnectionIndexCommand(sel), idx)
			},
		},

		////////////////////////////////////////////////////////////////
		// RTA source
		////////////////////////////////////////////////////////////////

		[CommonActions.SetRtaSource]: {
			name: 'Set RTA Source',
			description: 'Set the source strip feeding the RTA analyser. Uses the global strip index (1–76, 0 = off).',
			options: [...GetDropdownWithVariables('Strip', 'strip', [{ id: '0', label: 'Off' }, ...allChannels])],
			callback: async (event) => {
				const strip = ActionUtil.getStringWithVariables(event, 'strip')
				const idx = strip === '0' ? 0 : ActionUtil.getStripIndexFromString(strip)
				await send(ConfigurationCommands.RtaSource(), idx)
			},
		},

		////////////////////////////////////////////////////////////////
		// Gain compensation
		////////////////////////////////////////////////////////////////

		[CommonActions.TakeGainSnapshot]: {
			name: 'Gain Comp - Take Snapshot',
			description: 'Capture current gain and trim for all channels as the compensation reference.',
			options: [],
			callback: async () => {
				self.gainCompHandler?.takeSnapshot()
			},
		},

		[CommonActions.EnableGainComp]: {
			name: 'Gain Comp - Enable',
			description:
				'Enable gain compensation. Auto mode applies trim corrections immediately when gain changes. Manual mode waits for explicit per-channel compensate actions.',
			options: [
				...GetDropdownWithVariables('Mode', 'mode', [
					{ id: 'auto', label: 'Auto (reactive)' },
					{ id: 'manual', label: 'Manual (on demand)' },
				]),
			],
			callback: async (event) => {
				const mode = ActionUtil.getStringWithVariables(event, 'mode') as 'auto' | 'manual'
				self.gainCompHandler?.enable(mode)
			},
		},

		[CommonActions.DisableGainComp]: {
			name: 'Gain Comp - Disable',
			description: 'Disable gain compensation.',
			options: [],
			callback: async () => {
				self.gainCompHandler?.disable()
			},
		},

		[CommonActions.ToggleGainComp]: {
			name: 'Gain Comp - Toggle',
			description:
				'Enable compensation in the selected mode if not already active in that mode, otherwise disable. State-aware — safe to use on a single-step button.',
			options: [
				...GetDropdownWithVariables('Mode', 'mode', [
					{ id: 'auto', label: 'Auto (reactive)' },
					{ id: 'manual', label: 'Manual (on demand)' },
				]),
			],
			callback: async (event) => {
				const mode = ActionUtil.getStringWithVariables(event, 'mode') as 'auto' | 'manual'
				const handler = self.gainCompHandler
				if (!handler) return
				if (handler.isEnabled() && handler.getMode() === mode) {
					handler.disable()
				} else {
					handler.enable(mode)
				}
			},
		},

		[CommonActions.CompensateChannel]: {
			name: 'Gain Comp - Compensate Channel',
			description:
				'Apply gain compensation to a single channel (manual mode). Reads current gain and sets trim to preserve post-preamp level.',
			options: [...GetDropdownWithVariables('Channel', 'channel', state.namedChoices.channels)],
			callback: async (event) => {
				const channel = ActionUtil.getStringWithVariables(event, 'channel')
				const ch = ActionUtil.getNodeNumberFromID(channel)
				self.gainCompHandler?.compensateChannel(ch)
			},
		},

		////////////////////////////////////////////////////////////////
		// Batch multi-parameter actions
		////////////////////////////////////////////////////////////////

		[CommonActions.BatchKillSends]: {
			name: 'Batch Kill All Bus Sends',
			description: 'Disable all 16 bus sends from a channel or aux.',
			options: [
				...GetDropdownWithVariables('Strip', 'sel', [...state.namedChoices.channels, ...state.namedChoices.auxes]),
			],
			callback: async (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const num = ActionUtil.getNodeNumberFromID(sel)
				const type = sel.startsWith('/ch') ? 'ch' : 'aux'
				const node = `/${type}/${num}`
				const busCount = 16
				for (let i = 1; i <= busCount; i++) {
					await send(`${node}/send/${i}/on`, 0)
					state.set(`${node}/send/${i}/on`, [{ type: 'i', value: 0 }])
				}
			},
		},

		[CommonActions.BatchMicroScene]: {
			name: 'Batch Set Node Parameters',
			description:
				'Send a Wing multi-parameter batch set to any node. Format: key=value,key=value. Example node /ch/1 with params fdr=0,mute=0.',
			options: [
				...GetTextFieldWithVariables('Node Path', 'node', '/ch/1', 'OSC node to target (e.g. /ch/1, /bus/3)'),
				...GetTextFieldWithVariables(
					'Parameters',
					'params',
					'fdr=0,mute=0',
					'Comma-separated key=value pairs matching the Wing OSC parameter names for the target node',
				),
			],
			callback: async (event) => {
				const node = ActionUtil.getStringWithVariables(event, 'node')
				const params = ActionUtil.getStringWithVariables(event, 'params')
				if (!node || !params) return
				await send(node, params)
			},
		},
	}

	return actions
}
