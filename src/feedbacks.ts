import { WingSubscriptions } from './state/index.js'
import { InstanceBaseExt } from './types.js'
import { WingConfig } from './config.js'
import { SetRequired } from 'type-fest' // eslint-disable-line n/no-missing-import
import {
	combineRgb,
	CompanionAdvancedFeedbackResult,
	CompanionBooleanFeedbackDefinition,
	CompanionFeedbackDefinitions,
	CompanionFeedbackInfo,
} from '@companion-module/base'
import {
	GetDropdown,
	GetDropdownWithVariables,
	GetMuteDropdownWithVariables,
	GetSendSourceDestinationFieldsWithVariables,
} from './choices/common.js'
import { getTalkbackOptions } from './choices/config.js'
import { getTalkbackGroupChoices, resolveTalkbackGroupDests } from './talkback-groups.js'
import { ConfigurationCommands } from './commands/config.js'
import { getNodeNumber } from './actions/utils.js'
import { StateUtil } from './state/index.js'
import { UsbPlayerCommands } from './commands/usbplayer.js'
import * as ActionUtil from './actions/utils.js'
import { getIdLabelPair } from './choices/utils.js'
import { StatusCommands } from './commands/status.js'
import { getGpios } from './choices/control.js'
import { ControlCommands } from './commands/control.js'
import { CardsCommands } from './commands/cards.js'
import { IoCommands } from './commands/io.js'

import { getCardsChoices, getCardsStatusChoices, getCardsActionChoices } from './choices/cards.js'
import { EffectCommands, resolveInsertOnPath } from './commands/effect.js'
import { WingState } from './state/state.js'
import { GAIN_QUEUE_SLOTS } from './handlers/gain-compensation-handler.js'

/**
 * Extract the actual value from a Wing state entry.
 * Wing stores the raw OSC args array per path:
 *   1-arg (/*S push): [actual_value]
 *   3-arg (query):    [display_string, normalized, actual_value]
 * Always pick args[2] for 3-arg and args[0] for 1-arg.
 */
function getActualFromState(path: string, state: WingState): number | undefined {
	const args = state.get(path)
	if (!args || args.length === 0) return undefined
	const raw = args.length >= 3 ? args[2]?.value : args[0]?.value
	return typeof raw === 'number' ? raw : undefined
}

/**
 * Companion base v2 removed the `subscribe` hook from feedback definitions (only
 * `unsubscribe` remains). We keep authoring a module-defined `subscribe` here and
 * fold it into `callback` (idempotently, per feedback instance) in GetFeedbacksList
 * via {@link foldSubscribeIntoCallback} before handing definitions to Companion.
 */
type CompanionFeedbackWithCallback = SetRequired<CompanionBooleanFeedbackDefinition, 'callback' | 'unsubscribe'> & {
	subscribe?: (event: CompanionFeedbackInfo) => void | Promise<void>
}

/**
 * Fold any module-defined `subscribe` hook into the feedback's `callback` and strip it,
 * so the definitions satisfy the base v2 shape. The hook runs once per feedback instance
 * id (subscriptions are idempotent and renewed by the polling loop).
 */
function foldSubscribeIntoCallback(defs: Record<string, unknown>): CompanionFeedbackDefinitions {
	const subscribed = new Set<string>()
	for (const def of Object.values(defs)) {
		const entry = def as
			{ callback: (event: CompanionFeedbackInfo, context: unknown) => unknown; subscribe?: unknown } | undefined
		if (!entry) continue
		const sub = entry.subscribe
		if (typeof sub === 'function') {
			const origCallback = entry.callback
			entry.callback = (event: CompanionFeedbackInfo, context: unknown): unknown => {
				if (!subscribed.has(event.id)) {
					subscribed.add(event.id)
					void (sub as (event: CompanionFeedbackInfo) => void | Promise<void>)(event)
				}
				return origCallback(event, context)
			}
			delete (entry as { subscribe?: unknown }).subscribe
		}
	}
	return defs as CompanionFeedbackDefinitions
}

export enum FeedbackId {
	Mute = 'mute',
	SendMute = 'send-mute',
	AesStatus = 'aes-status',
	RecorderState = 'recorder-state',
	PlayerState = 'player-state',
	WLiveSDState = 'wlive-sd-state',
	WLivePlaybackState = 'wlive-playback-state',
	GpioState = 'gpio-state',
	Solo = 'solo',
	SoloModeExclusive = 'solo-mode-exclusive',
	AnySoloActive = 'any-solo-active',
	SoloDim = 'solo-dim',
	SoloMono = 'solo-mono',
	SoloLRSwap = 'solo-lr-swap',
	SoloMonitor = 'solo-monitor',
	Talkback = 'talkback',
	TalkbackAssign = 'talkback-assign',
	TalkbackAllAssigned = 'talkback-all-assigned',
	InsertOn = 'insert-on',
	MainAltSwitch = 'main-alt-switch',
	ActiveScene = 'active-scene',
	SofActive = 'sof-active',
	FxMuted = 'fx-muted',
	FxInsertOn = 'fx-insert-on',
	PhaseInvert = 'phase-invert',
	SendMode = 'send-mode',
	PhantomPower = 'phantom-power',
	ChannelAltSource = 'channel-alt-source',
	GainCompActive = 'gain-comp-active',
	GainCompManualActive = 'gain-comp-manual-active',
	GainCompSnapshotExists = 'gain-comp-snapshot-exists',
	ChannelNeedsComp = 'channel-needs-comp',
	GainDisplay = 'ch-gain-display',
	GainQueueSlot = 'gain-queue-slot',
	FaderDisplay = 'fader-display',
	StripColour = 'strip-colour',
}

function subscribeFeedback(
	ensureLoaded: (path: string) => void,
	subs: WingSubscriptions,
	path: string,
	event: CompanionFeedbackInfo,
): void {
	subs.subscribe(path, event.id, event.feedbackId as FeedbackId)
	ensureLoaded(path)
}
function unsubscribeFeedback(subs: WingSubscriptions, path: string, event: CompanionFeedbackInfo): void {
	subs.unsubscribe(path, event.id)
}

export function GetFeedbacksList(_self: InstanceBaseExt<WingConfig>): CompanionFeedbackDefinitions {
	const state = _self.stateHandler?.state
	if (!state) throw new Error('State handler or state is not available')
	const subs = _self.feedbackHandler?.subscriptions
	if (!subs) throw new Error('Feedback handler or subscriptions are not available')
	// Feedback subscriptions use fire-and-forget sendCommand instead of the
	// queued ensureLoaded. ensureLoaded has a user-configurable timeout (default
	// 200ms, but some users set 20ms) that causes timeout errors and orphaned
	// async frames when Wing doesn't respond within that window. sendCommand is
	// fire-and-forget: Wing responds when ready, state updates, feedbacks refresh.
	const ensureLoaded = (path: string): void => {
		_self.connection?.sendCommand(path).catch(() => {})
	}
	if (!_self.connection) throw new Error('Connection is not available')
	const allChannels = [
		...state.namedChoices.channels,
		...state.namedChoices.auxes,
		...state.namedChoices.busses,
		...state.namedChoices.matrices,
		...state.namedChoices.mains,
	]

	const allChannelsAndDcas = [...allChannels, ...state.namedChoices.dcas]

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

	// All talkback-assignable destinations (busses, matrices, mains) and a helper that resolves
	// the assign commands a "Talkback - All Selected Destinations Assigned" feedback should check,
	// honouring its talkback (A/B/both) and its selected destination subset.
	const talkbackDestChoices = [
		...state.namedChoices.busses,
		...state.namedChoices.matrices,
		...state.namedChoices.mains,
	]
	const talkbackAllAssignCommands = (event: CompanionFeedbackInfo): string[] => {
		const tb = ActionUtil.getStringWithVariables(event, 'tb')
		const talkbacks = tb === 'AB' ? ['A', 'B'] : [tb]
		const customDests = (event.options['dests'] as string[] | undefined) ?? []
		const selected = resolveTalkbackGroupDests(
			_self.config,
			event.options['destgroup'] as string,
			_self.model,
			customDests,
		)
		const cmds: string[] = []
		for (const tbk of talkbacks) {
			for (const destId of selected) {
				cmds.push(ActionUtil.getTalkbackAssignCommand(tbk, destId))
			}
		}
		return cmds
	}

	const feedbacks: { [id in FeedbackId]: CompanionFeedbackWithCallback | undefined } = {
		[FeedbackId.FxMuted]: {
			type: 'boolean',
			name: 'FX Slot - Mix at Zero',
			description: 'Active when an FX slot fxmix is 0 (effect is silenced).',
			options: [...GetDropdownWithVariables('FX Slot', 'slot', state.namedChoices.effects)],
			defaultStyle: { bgcolor: combineRgb(255, 165, 0), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const slot = ActionUtil.getStringWithVariables(event, 'slot')
				const slotNum = ActionUtil.getNodeNumberFromID(slot)
				const cmd = EffectCommands.FxMix(slotNum)
				const mix = StateUtil.getNumberFromState(cmd, state)
				return typeof mix === 'number' && mix === 0
			},
			subscribe: async (event): Promise<void> => {
				const slot = ActionUtil.getStringWithVariables(event, 'slot')
				const slotNum = ActionUtil.getNodeNumberFromID(slot)
				const cmd = EffectCommands.FxMix(slotNum)
				subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const slot = ActionUtil.getStringWithVariables(event, 'slot')
				const slotNum = ActionUtil.getNodeNumberFromID(slot)
				const cmd = EffectCommands.FxMix(slotNum)
				unsubscribeFeedback(subs, cmd, event)
			},
		},
		[FeedbackId.FxInsertOn]: {
			type: 'boolean',
			name: 'FX Slot - Insert On',
			description:
				'Active when the insert of an FX slot is enabled. Resolves the target channel via $a_chn and $a_pos.',
			options: [...GetDropdownWithVariables('FX Slot', 'slot', state.namedChoices.effects)],
			defaultStyle: { bgcolor: combineRgb(0, 200, 0), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const slot = ActionUtil.getStringWithVariables(event, 'slot')
				const slotNum = ActionUtil.getNodeNumberFromID(slot)
				const ch = StateUtil.getNumberFromState(EffectCommands.AssignedChannel(slotNum), state)
				const pos = StateUtil.getNumberFromState(EffectCommands.AssignedInsertSlot(slotNum), state)
				if (ch === undefined || pos === undefined) return false
				const onCmd = resolveInsertOnPath(ch, pos)
				if (!onCmd) return false
				const val = StateUtil.getNumberFromState(onCmd, state)
				if (val === undefined) {
					// $a_chn/$a_pos just loaded but the insert path is not in state yet — subscribe and
					// request it now. subs.subscribe is idempotent so calling this on every check is safe.
					subs.subscribe(onCmd, event.id, FeedbackId.FxInsertOn)
					ensureLoaded(onCmd)
					return false
				}
				return val === 1
			},
			subscribe: async (event): Promise<void> => {
				const slot = ActionUtil.getStringWithVariables(event, 'slot')
				const slotNum = ActionUtil.getNodeNumberFromID(slot)
				subscribeFeedback(ensureLoaded, subs, EffectCommands.AssignedChannel(slotNum), event)
				subscribeFeedback(ensureLoaded, subs, EffectCommands.AssignedInsertSlot(slotNum), event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const slot = ActionUtil.getStringWithVariables(event, 'slot')
				const slotNum = ActionUtil.getNodeNumberFromID(slot)
				unsubscribeFeedback(subs, EffectCommands.AssignedChannel(slotNum), event)
				unsubscribeFeedback(subs, EffectCommands.AssignedInsertSlot(slotNum), event)
				const ch = StateUtil.getNumberFromState(EffectCommands.AssignedChannel(slotNum), state)
				const pos = StateUtil.getNumberFromState(EffectCommands.AssignedInsertSlot(slotNum), state)
				const onCmd = ch !== undefined && pos !== undefined ? resolveInsertOnPath(ch, pos) : undefined
				if (onCmd) unsubscribeFeedback(subs, onCmd, event)
			},
		},
		[FeedbackId.MainAltSwitch]: {
			type: 'boolean',
			name: 'Main/Alt Input Source',
			description: 'React to the selected input source group (Main or Alt).',
			options: [
				...GetDropdownWithVariables('Selected', 'sel', [getIdLabelPair('1', 'Main'), getIdLabelPair('0', 'Alt')]),
			],
			defaultStyle: { bgcolor: combineRgb(0, 255, 0), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const cmd = IoCommands.MainAltSwitch()
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const currentValue = StateUtil.getNumberFromState(cmd, state)
				// Wing reports 0 for Main, 1 for Alt; invert to match UI labels
				return typeof currentValue === 'number' && `${Number(!currentValue)}` === sel
			},
			subscribe: async (event): Promise<void> => {
				const cmd = IoCommands.MainAltSwitch()
				subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const cmd = IoCommands.MainAltSwitch()
				unsubscribeFeedback(subs, cmd, event)
			},
		},

		[FeedbackId.ChannelAltSource]: {
			type: 'boolean',
			name: 'Channel/Aux on Alt Input',
			description: 'Active when a channel or aux is switched to its Alt input source.',
			defaultStyle: { color: combineRgb(255, 255, 255), bgcolor: combineRgb(180, 80, 0) },
			options: [
				...GetDropdownWithVariables('Channel', 'sel', [...state.namedChoices.channels, ...state.namedChoices.auxes]),
			],
			callback: (event: CompanionFeedbackInfo): boolean => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getInputAltSourceCommand(sel)
				if (!cmd) return false
				const val = StateUtil.getNumberFromState(cmd, state)
				return val === 1
			},
			subscribe: async (event): Promise<void> => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getInputAltSourceCommand(sel)
				if (cmd) subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getInputAltSourceCommand(sel)
				if (cmd) unsubscribeFeedback(subs, cmd, event)
			},
		},

		[FeedbackId.Mute]: {
			type: 'boolean',
			name: 'Mute',
			description: "React to a change in a channel's mute state",
			options: [
				...GetDropdownWithVariables('Selection', 'sel', [...allChannelsAndDcas, ...state.namedChoices.mutegroups]),
				...GetMuteDropdownWithVariables('mute', 'State', false),
			],
			defaultStyle: { bgcolor: combineRgb(0, 255, 0), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const mute = ActionUtil.getNumberWithVariables(event, 'mute')
				const cmd = ActionUtil.getMuteCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				const currentValue = StateUtil.getNumberFromState(cmd, state)
				return typeof currentValue === 'number' && currentValue == mute
			},
			subscribe: async (event): Promise<void> => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getMuteCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getMuteCommand(sel, ActionUtil.getNodeNumberFromID(sel))
				unsubscribeFeedback(subs, cmd, event)
			},
		},
		[FeedbackId.SendMute]: {
			type: 'boolean',
			name: 'Send Mute',
			description: "React to a change in a channel's send mute state",
			options: [
				...GetSendSourceDestinationFieldsWithVariables(
					allSendSources,
					channelAuxBusSendDestinations,
					mainSendDestinations,
				),
				...GetMuteDropdownWithVariables('mute', 'Mute', false),
			],
			defaultStyle: { bgcolor: combineRgb(0, 255, 0), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const { src, dest } = ActionUtil.GetSendSourceDestinationFieldsWithVariables(event)
				const cmd = ActionUtil.getSendMuteCommand(src, dest)
				let val = ActionUtil.getNumberWithVariables(event, 'mute')
				// Mute states are inverted for sends
				if (val != -1) {
					val = val == 0 ? 1 : 0
				}
				const currentValue = StateUtil.getNumberFromState(cmd, state)
				return typeof currentValue === 'number' && currentValue != val
			},
			subscribe: async (event): Promise<void> => {
				const { src, dest } = ActionUtil.GetSendSourceDestinationFieldsWithVariables(event)
				const cmd = ActionUtil.getSendMuteCommand(src, dest)
				subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const { src, dest } = ActionUtil.GetSendSourceDestinationFieldsWithVariables(event)
				const cmd = ActionUtil.getSendMuteCommand(src, dest)
				unsubscribeFeedback(subs, cmd, event)
			},
		},
		[FeedbackId.AesStatus]: {
			type: 'boolean',
			name: 'AES Status',
			description: 'Status of an AES Connection',
			options: [
				...GetDropdownWithVariables('Interface', 'aes', [
					getIdLabelPair('A', 'AES A'),
					getIdLabelPair('B', 'AES B'),
					getIdLabelPair('C', 'AES C'),
				]),
				...GetDropdownWithVariables('Status', 'status', [
					getIdLabelPair('OK', 'OK'),
					getIdLabelPair('ERR', 'Error'),
					getIdLabelPair('UPD', 'Updating'),
					getIdLabelPair('-', 'Not Connected'),
				]),
			],
			defaultStyle: { bgcolor: combineRgb(0, 255, 0), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const aes = ActionUtil.getStringWithVariables(event, 'aes')
				const status = ActionUtil.getStringWithVariables(event, 'status')
				const cmd = StatusCommands.AesStatus(aes)
				const val = StateUtil.getStringFromState(cmd, state) as string
				return val === status
			},
			subscribe: async (event): Promise<void> => {
				const aes = ActionUtil.getStringWithVariables(event, 'aes')
				const cmd = StatusCommands.AesStatus(aes)
				subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const aes = ActionUtil.getStringWithVariables(event, 'aes')
				const cmd = StatusCommands.AesStatus(aes)
				unsubscribeFeedback(subs, cmd, event)
			},
		},
		[FeedbackId.RecorderState]: {
			type: 'boolean',
			name: 'USB Recorder State',
			description: 'React to the current state of the USB Recorder',
			options: [
				...GetDropdownWithVariables('State', 'state', [
					getIdLabelPair('REC', 'Recording'),
					getIdLabelPair('PAUSE', 'Paused'),
					getIdLabelPair('STOP', 'Stopped'),
				]),
			],
			defaultStyle: { bgcolor: combineRgb(255, 0, 0), color: combineRgb(255, 255, 255) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const val = ActionUtil.getStringWithVariables(event, 'state')
				const cmd = UsbPlayerCommands.RecorderActiveState()
				const recState = StateUtil.getStringFromState(cmd, state)
				return recState === val
			},
			subscribe: async (event): Promise<void> => {
				const cmd = UsbPlayerCommands.RecorderActiveState()
				subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const cmd = UsbPlayerCommands.RecorderActiveState()
				unsubscribeFeedback(subs, cmd, event)
			},
		},
		[FeedbackId.PlayerState]: {
			type: 'boolean',
			name: 'USB Player State',
			description: 'React to the current state of the USB Player',
			options: [
				...GetDropdownWithVariables('State', 'state', [
					getIdLabelPair('PLAY', 'Playing'),
					getIdLabelPair('PAUSE', 'Paused'),
					getIdLabelPair('STOP', 'Stopped'),
				]),
			],
			defaultStyle: { bgcolor: combineRgb(0, 255, 0), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const val = ActionUtil.getStringWithVariables(event, 'state')
				const cmd = UsbPlayerCommands.PlayerActiveState()
				const playerState = StateUtil.getStringFromState(cmd, state)
				return playerState === val
			},
			subscribe: async (event): Promise<void> => {
				const cmd = UsbPlayerCommands.PlayerActiveState()
				subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const cmd = UsbPlayerCommands.PlayerActiveState()
				unsubscribeFeedback(subs, cmd, event)
			},
		},
		[FeedbackId.WLiveSDState]: {
			type: 'boolean',
			name: 'WLive SD State',
			description: 'React to the state of the WLive SD Cards.',
			options: [
				...GetDropdownWithVariables('Card', 'card', getCardsChoices()),
				...GetDropdownWithVariables('State', 'state', getCardsStatusChoices()),
			],
			defaultStyle: { bgcolor: combineRgb(0, 255, 0), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const card = ActionUtil.getNumberWithVariables(event, 'card')
				const val = ActionUtil.getStringWithVariables(event, 'state')
				const cmd = CardsCommands.WLiveCardSDState(card)
				const currentValue = StateUtil.getStringFromState(cmd, state)
				return currentValue == val
			},
			subscribe: async (event): Promise<void> => {
				const card = ActionUtil.getNumberWithVariables(event, 'card')
				const cmd = CardsCommands.WLiveCardSDState(card)
				// Register subscription only — no ensureLoaded. WLive state may not
				// respond if cards are absent; the wlivePoller keeps state current.
				subs.subscribe(cmd, event.id, event.feedbackId as FeedbackId)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const card = ActionUtil.getNumberWithVariables(event, 'card')
				const cmd = CardsCommands.WLiveCardSDState(card)
				unsubscribeFeedback(subs, cmd, event)
			},
		},
		[FeedbackId.WLivePlaybackState]: {
			type: 'boolean',
			name: 'WLive Playback State',
			description: 'React to the playback state of a WLive Card.',
			options: [
				...GetDropdownWithVariables('Card', 'card', getCardsChoices()),
				...GetDropdownWithVariables('State', 'state', getCardsActionChoices()),
			],
			defaultStyle: { bgcolor: combineRgb(0, 255, 0), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const card = ActionUtil.getNumberWithVariables(event, 'card')
				const val = ActionUtil.getStringWithVariables(event, 'state')
				const cmd = CardsCommands.WLiveCardState(card)
				const currentValue = StateUtil.getStringFromState(cmd, state)
				return currentValue == val
			},
			subscribe: async (event): Promise<void> => {
				const card = ActionUtil.getNumberWithVariables(event, 'card')
				const cmd = CardsCommands.WLiveCardState(card)
				subs.subscribe(cmd, event.id, event.feedbackId as FeedbackId)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const card = ActionUtil.getNumberWithVariables(event, 'card')
				const cmd = CardsCommands.WLiveCardState(card)
				unsubscribeFeedback(subs, cmd, event)
			},
		},
		[FeedbackId.GpioState]: {
			type: 'boolean',
			name: 'GPIO State',
			description: "React to a change in a gpio's state",
			options: [
				...GetDropdownWithVariables('Selection', 'sel', getGpios(4)),
				...GetDropdownWithVariables('State', 'state', [getIdLabelPair('1', 'On'), getIdLabelPair('0', 'Off')]),
			],
			defaultStyle: { bgcolor: combineRgb(0, 255, 0), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const sel = ActionUtil.getNumberWithVariables(event, 'sel')
				const val = ActionUtil.getNumberWithVariables(event, 'state')
				const cmd = ControlCommands.GpioReadState(sel)
				const currentValue = StateUtil.getNumberFromState(cmd, state)
				return typeof currentValue === 'number' && currentValue == val
			},
			subscribe: async (event): Promise<void> => {
				const sel = ActionUtil.getNumberWithVariables(event, 'sel')
				const cmd = ControlCommands.GpioReadState(sel)
				subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const sel = ActionUtil.getNumberWithVariables(event, 'sel')
				const cmd = ControlCommands.GpioReadState(sel)
				unsubscribeFeedback(subs, cmd, event)
			},
		},
		[FeedbackId.Solo]: {
			type: 'boolean',
			name: 'Solo',
			description: "React to a change in a channel's solo state",
			options: [
				...GetDropdownWithVariables('Selection', 'sel', [
					getIdLabelPair('any', 'Any'),
					getIdLabelPair('all', 'All'),
					...allChannelsAndDcas,
				]),
				...GetDropdownWithVariables('Solo', 'solo', [getIdLabelPair('1', 'On'), getIdLabelPair('0', 'Off')]),
			],
			defaultStyle: { bgcolor: combineRgb(255, 255, 0), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const solo = ActionUtil.getNumberWithVariables(event, 'solo')
				if (sel == 'any') {
					return allChannelsAndDcas.some((s) => {
						const num = s.id.toString().split('/')[2] as unknown as number
						const cmd = ActionUtil.getSoloCommand(s.id as string, num)
						const currentValue = StateUtil.getNumberFromState(cmd, state)
						return currentValue == solo
					})
				} else if (sel == 'all') {
					return allChannelsAndDcas.every((s) => {
						const num = s.id.toString().split('/')[2] as unknown as number
						const cmd = ActionUtil.getSoloCommand(s.id as string, num)
						const currentValue = StateUtil.getNumberFromState(cmd, state)
						return currentValue == solo
					})
				} else {
					const cmd = ActionUtil.getSoloCommand(sel, getNodeNumber(event, 'sel'))
					const currentValue = StateUtil.getNumberFromState(cmd, state)
					return typeof currentValue === 'number' && currentValue == solo
				}
			},
			subscribe: async (event): Promise<void> => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				if (sel == 'any' || sel == 'all') {
					allChannelsAndDcas.forEach((s) => {
						const num = s.id.toString().split('/')[2] as unknown as number
						const cmd = ActionUtil.getSoloCommand(s.id as string, num)
						subscribeFeedback(ensureLoaded, subs, cmd, event)
					})
				} else {
					const cmd = ActionUtil.getSoloCommand(sel, getNodeNumber(event, 'sel'))
					subscribeFeedback(ensureLoaded, subs, cmd, event)
				}
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				if (sel == 'any' || sel == 'all') {
					allChannelsAndDcas.forEach((s) => {
						const num = s.id.toString().split('/')[2] as unknown as number
						const cmd = ActionUtil.getSoloCommand(s.id as string, num)
						unsubscribeFeedback(subs, cmd, event)
					})
				} else {
					const cmd = ActionUtil.getSoloCommand(sel, getNodeNumber(event, 'sel'))
					unsubscribeFeedback(subs, cmd, event)
				}
			},
		},
		[FeedbackId.SoloDim]: {
			type: 'boolean',
			name: 'Solo Dim',
			description: 'React to the dim state of the solo output.',
			options: [...GetDropdownWithVariables('Dim', 'dim', [getIdLabelPair('1', 'On'), getIdLabelPair('0', 'Off')])],
			defaultStyle: { bgcolor: combineRgb(255, 255, 0), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const val = ActionUtil.getNumberWithVariables(event, 'dim')
				const cmd = ConfigurationCommands.SoloDim()
				const currentValue = StateUtil.getNumberFromState(cmd, state)
				return typeof currentValue === 'number' && currentValue == val
			},
			subscribe: (event): void => {
				const cmd = ConfigurationCommands.SoloDim()
				subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const cmd = ConfigurationCommands.SoloDim()
				unsubscribeFeedback(subs, cmd, event)
			},
		},
		[FeedbackId.SoloMono]: {
			type: 'boolean',
			name: 'Solo Mono',
			description: 'React to the mono state of the solo output.',
			options: [...GetDropdownWithVariables('Mono', 'mono', [getIdLabelPair('1', 'On'), getIdLabelPair('0', 'Off')])],
			defaultStyle: { bgcolor: combineRgb(255, 255, 0), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const val = ActionUtil.getNumberWithVariables(event, 'mono')
				const cmd = ConfigurationCommands.SoloMono()
				const currentValue = StateUtil.getNumberFromState(cmd, state)
				return typeof currentValue === 'number' && currentValue == val
			},
			subscribe: (event): void => {
				const cmd = ConfigurationCommands.SoloMono()
				subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const cmd = ConfigurationCommands.SoloMono()
				unsubscribeFeedback(subs, cmd, event)
			},
		},
		[FeedbackId.SoloModeExclusive]: {
			type: 'boolean',
			name: 'Solo Mode: Individual (Companion)',
			description:
				'Active when the Companion-side solo mode is Individual (exclusive), off when Additive. This is a module setting, not a console setting.',
			options: [],
			defaultStyle: { bgcolor: combineRgb(0, 200, 0), color: combineRgb(0, 0, 0) },
			callback: (): boolean => _self.soloExclusive,
			unsubscribe: (): void => {},
		},
		[FeedbackId.AnySoloActive]: {
			type: 'boolean',
			name: 'Any Solo Active',
			description: 'Active when any strip is soloed (the console solo indicator).',
			options: [],
			defaultStyle: { bgcolor: combineRgb(255, 165, 0), color: combineRgb(0, 0, 0) },
			callback: (): boolean => {
				// /$stat/solo may report as a number (1/0) or a string; treat any truthy value as active.
				const num = StateUtil.getNumberFromState(StatusCommands.Solo(), state)
				if (typeof num === 'number') return num !== 0
				const str = StateUtil.getStringFromState(StatusCommands.Solo(), state)
				return str !== undefined && str !== '' && str !== '0' && str.toLowerCase() !== 'off'
			},
			subscribe: (event): void => {
				subscribeFeedback(ensureLoaded, subs, StatusCommands.Solo(), event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				unsubscribeFeedback(subs, StatusCommands.Solo(), event)
			},
		},
		[FeedbackId.SoloLRSwap]: {
			type: 'boolean',
			name: 'Solo LR Swap',
			description: 'React to the left-right channel swap state of the solo output.',
			options: [...GetDropdownWithVariables('Swap', 'swap', [getIdLabelPair('1', 'On'), getIdLabelPair('0', 'Off')])],
			defaultStyle: { bgcolor: combineRgb(255, 255, 0), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const val = ActionUtil.getNumberWithVariables(event, 'swap')
				const cmd = ConfigurationCommands.SoloLRSwap()
				const currentValue = StateUtil.getNumberFromState(cmd, state)
				return typeof currentValue === 'number' && currentValue == val
			},
			subscribe: (event): void => {
				const cmd = ConfigurationCommands.SoloLRSwap()
				subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const cmd = ConfigurationCommands.SoloLRSwap()
				unsubscribeFeedback(subs, cmd, event)
			},
		},
		[FeedbackId.SoloMonitor]: {
			type: 'boolean',
			name: 'Solo Monitor Output',
			description: 'Active when the solo monitor output matches the selected destination.',
			options: [
				...GetDropdownWithVariables('Output', 'out', [
					getIdLabelPair('SPK', 'Speaker'),
					getIdLabelPair('PH', 'Phones'),
					getIdLabelPair('PH+SPK', 'Both'),
				]),
			],
			defaultStyle: { bgcolor: combineRgb(0, 160, 220), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const val = ActionUtil.getStringWithVariables(event, 'out')
				const current = StateUtil.getStringFromState(ConfigurationCommands.SoloMonitor(), state)
				return current === val
			},
			subscribe: (event): void => {
				subscribeFeedback(ensureLoaded, subs, ConfigurationCommands.SoloMonitor(), event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				unsubscribeFeedback(subs, ConfigurationCommands.SoloMonitor(), event)
			},
		},
		[FeedbackId.Talkback]: {
			type: 'boolean',
			name: 'Talkback',
			description: 'React to the status of a talkback channel.',
			options: [
				...GetDropdownWithVariables('Talkback', 'tb', getTalkbackOptions()),
				...GetDropdownWithVariables('On/Off', 'on', [getIdLabelPair('1', 'On'), getIdLabelPair('0', 'Off')]),
			],
			defaultStyle: { bgcolor: combineRgb(255, 0, 0), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const tb = ActionUtil.getStringWithVariables(event, 'tb')
				const val = ActionUtil.getNumberWithVariables(event, 'on')
				const cmd = ConfigurationCommands.TalkbackOn(tb)
				const currentValue = StateUtil.getNumberFromState(cmd, state)
				return typeof currentValue === 'number' && currentValue == val
			},
			subscribe: async (event): Promise<void> => {
				const tb = ActionUtil.getStringWithVariables(event, 'tb')
				const cmd = ConfigurationCommands.TalkbackOn(tb)
				subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const tb = ActionUtil.getStringWithVariables(event, 'tb')
				const cmd = ConfigurationCommands.TalkbackOn(tb)
				unsubscribeFeedback(subs, cmd, event)
			},
		},
		[FeedbackId.TalkbackAssign]: {
			type: 'boolean',
			name: 'Talkback Assign',
			description: 'React to the assignment of a talkback channel to a bus matrix or main',
			options: [
				...GetDropdownWithVariables('Talkback', 'tb', getTalkbackOptions()),
				...GetDropdownWithVariables('Destination', 'dest', [
					...state.namedChoices.busses,
					...state.namedChoices.matrices,
					...state.namedChoices.mains,
				]),
				...GetDropdownWithVariables('Assign', 'assign', [
					getIdLabelPair('1', 'Assigned'),
					getIdLabelPair('0', 'Not Assigned'),
				]),
			],
			defaultStyle: { bgcolor: combineRgb(0, 255, 0), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const talkback = ActionUtil.getStringWithVariables(event, 'tb')
				const destination = ActionUtil.getStringWithVariables(event, 'dest')
				const assign = ActionUtil.getNumberWithVariables(event, 'assign')
				const cmd = ActionUtil.getTalkbackAssignCommand(talkback, destination)
				const currentValue = StateUtil.getNumberFromState(cmd, state)
				return typeof currentValue === 'number' && currentValue == assign
			},
			subscribe: async (event): Promise<void> => {
				const talkback = ActionUtil.getStringWithVariables(event, 'tb')
				const destination = ActionUtil.getStringWithVariables(event, 'dest')
				const cmd = ActionUtil.getTalkbackAssignCommand(talkback, destination)
				subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const talkback = ActionUtil.getStringWithVariables(event, 'tb')
				const destination = ActionUtil.getStringWithVariables(event, 'dest')
				const cmd = ActionUtil.getTalkbackAssignCommand(talkback, destination)
				unsubscribeFeedback(subs, cmd, event)
			},
		},
		[FeedbackId.TalkbackAllAssigned]: {
			type: 'boolean',
			name: 'Talkback - All Selected Destinations Assigned',
			description:
				'Active only when every selected destination is assigned for the chosen talkback. Leave the destination list at its default (all) for a global "All Call", or pick a subset (e.g. all ear busses) so the button lights only when that whole group is assigned.',
			options: [
				...GetDropdownWithVariables('Talkback', 'tb', [...getTalkbackOptions(), getIdLabelPair('AB', 'Both (A + B)')]),
				{
					type: 'dropdown',
					id: 'destgroup',
					label: 'Destination group',
					default: 'all',
					choices: getTalkbackGroupChoices(_self.config),
				},
				{
					type: 'multidropdown',
					id: 'dests',
					label: 'Custom destinations (all of these must be assigned)',
					choices: talkbackDestChoices,
					default: talkbackDestChoices.map((d) => d.id),
					minSelection: 1,
					isVisibleExpression: `$(options:destgroup) == 'custom'`,
				},
			],
			defaultStyle: { bgcolor: combineRgb(220, 220, 220), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const cmds = talkbackAllAssignCommands(event)
				if (cmds.length === 0) return false
				return cmds.every((cmd) => StateUtil.getNumberFromState(cmd, state) === 1)
			},
			subscribe: (event): void => {
				for (const cmd of talkbackAllAssignCommands(event)) {
					subscribeFeedback(ensureLoaded, subs, cmd, event)
				}
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				for (const cmd of talkbackAllAssignCommands(event)) {
					unsubscribeFeedback(subs, cmd, event)
				}
			},
		},
		[FeedbackId.InsertOn]: {
			type: 'boolean',
			name: 'Insert On',
			description: 'React to a change for an insert on a channel, aux, bus, matrix or main.',
			options: [
				...GetDropdownWithVariables('Insert', 'insert', [
					getIdLabelPair('pre', 'Pre-Insert'),
					getIdLabelPair('post', 'Post-Insert'),
					getIdLabelPair('both', 'Both'),
					getIdLabelPair('either', 'Either'),
				]),
				...GetDropdownWithVariables('Selection', 'sel', [...allChannels]),
				...GetDropdownWithVariables('On/Off', 'on', [getIdLabelPair('1', 'On'), getIdLabelPair('0', 'Off')]),
			],
			defaultStyle: { bgcolor: combineRgb(255, 0, 0), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const insert = ActionUtil.getStringWithVariables(event, 'insert')
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const on = ActionUtil.getNumberWithVariables(event, 'on')

				const preCmd = ActionUtil.getPreInsertOnCommand(sel, getNodeNumber(event, 'sel'))
				const preOn = (StateUtil.getNumberFromState(preCmd, state) ?? 0) == on

				const postCmd = ActionUtil.getPostInsertCommand(sel, getNodeNumber(event, 'sel'))
				const postOn = (StateUtil.getNumberFromState(postCmd, state) ?? 0) == on

				if (insert === 'pre') return preOn
				if (insert === 'post') return postOn
				if (insert === 'both') return preOn && postOn
				if (insert === 'either') return preOn || postOn
				return false
			},
			subscribe: async (event): Promise<void> => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				let cmd = ActionUtil.getPreInsertOnCommand(sel, getNodeNumber(event, 'sel'))
				subscribeFeedback(ensureLoaded, subs, cmd, event)
				cmd = ActionUtil.getPostInsertCommand(sel, getNodeNumber(event, 'sel'))
				subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				let cmd = ActionUtil.getPreInsertOnCommand(sel, getNodeNumber(event, 'sel'))
				unsubscribeFeedback(subs, cmd, event)
				cmd = ActionUtil.getPostInsertCommand(sel, getNodeNumber(event, 'sel'))
				unsubscribeFeedback(subs, cmd, event)
			},
		},
		[FeedbackId.ActiveScene]: {
			type: 'boolean',
			name: 'Active Scene',
			description: 'React to the currently active scene',
			options: [GetDropdown('Scene', 'scene', state.namedChoices.scenes)],
			defaultStyle: { bgcolor: combineRgb(0, 255, 0), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const sceneName = event.options.scene as string
				const sceneNumber = state.sceneNameToIdMap.get(sceneName) ?? 0
				const cmd = ControlCommands.LibraryActiveSceneIndex()
				const currentSceneNumber = StateUtil.getNumberFromState(cmd, state)
				return typeof currentSceneNumber === 'number' && currentSceneNumber === sceneNumber
			},
			subscribe: (event): void => {
				const cmd = ControlCommands.LibraryActiveSceneIndex()
				subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const cmd = ControlCommands.LibraryActiveSceneIndex()
				unsubscribeFeedback(subs, cmd, event)
			},
		},
		[FeedbackId.SofActive]: {
			type: 'boolean',
			name: 'SOF Active',
			description: 'React to the Sends on Fade mode',
			options: [
				...GetDropdownWithVariables(
					'Channel',
					'channel',
					[
						{ id: 'off', label: 'Off' },
						...state.namedChoices.channels,
						...state.namedChoices.auxes,
						...state.namedChoices.busses,
						...state.namedChoices.mains,
						...state.namedChoices.matrices,
					],
					'off',
				),
			],
			defaultStyle: { bgcolor: combineRgb(0, 255, 0), color: combineRgb(0, 0, 0) },
			callback: (event: CompanionFeedbackInfo): boolean => {
				const channel = ActionUtil.getStringWithVariables(event, 'channel')
				const channelIndex = ActionUtil.getStripIndexFromString(channel)
				const cmd = ControlCommands.SetSof()
				const currentSelectedIndex = StateUtil.getNumberFromState(cmd, state)
				return currentSelectedIndex === channelIndex
			},
			subscribe: async (event): Promise<void> => {
				const cmd = ControlCommands.SetSof()
				subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event: CompanionFeedbackInfo): void => {
				const cmd = ControlCommands.SetSof()
				unsubscribeFeedback(subs, cmd, event)
			},
		},
		[FeedbackId.PhaseInvert]: {
			type: 'boolean',
			name: 'Phase Inverted',
			description: 'Active when the phase is inverted on a channel or strip.',
			defaultStyle: {
				color: combineRgb(255, 255, 0),
				bgcolor: combineRgb(180, 0, 0),
			},
			options: [...GetDropdownWithVariables('Strip', 'sel', allChannels)],
			callback: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getPhaseInvertCommand(sel)
				return StateUtil.getBooleanFromState(cmd, state) === true
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getPhaseInvertCommand(sel)
				if (cmd) subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getPhaseInvertCommand(sel)
				if (cmd) unsubscribeFeedback(subs, cmd, event)
			},
		},

		[FeedbackId.SendMode]: {
			type: 'boolean',
			name: 'Send Mode',
			description: 'Active when a bus send is in the specified mode (PRE / POST / GRP).',
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 100, 180),
			},
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
			callback: (event) => {
				const src = ActionUtil.getStringWithVariables(event, 'src')
				const dest = ActionUtil.getStringWithVariables(event, 'dest')
				const mode = ActionUtil.getStringWithVariables(event, 'mode')
				const cmd = ActionUtil.getSendModeCommand(src, dest)
				return StateUtil.getStringFromState(cmd, state) === mode
			},
			subscribe: (event) => {
				const src = ActionUtil.getStringWithVariables(event, 'src')
				const dest = ActionUtil.getStringWithVariables(event, 'dest')
				const cmd = ActionUtil.getSendModeCommand(src, dest)
				if (cmd) subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event) => {
				const src = ActionUtil.getStringWithVariables(event, 'src')
				const dest = ActionUtil.getStringWithVariables(event, 'dest')
				const cmd = ActionUtil.getSendModeCommand(src, dest)
				if (cmd) unsubscribeFeedback(subs, cmd, event)
			},
		},

		[FeedbackId.PhantomPower]: {
			type: 'boolean',
			name: 'Phantom Power Active',
			description: 'Active when phantom power (+48V) is enabled on a channel or aux strip.',
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(255, 140, 0),
			},
			options: [
				...GetDropdownWithVariables('Strip', 'sel', [...state.namedChoices.channels, ...state.namedChoices.auxes]),
			],
			callback: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getPhantomPowerCommand(sel)
				if (!cmd) return false
				const val = StateUtil.getNumberFromState(cmd, state)
				return val === 1
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getPhantomPowerCommand(sel)
				if (cmd) subscribeFeedback(ensureLoaded, subs, cmd, event)
			},
			unsubscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const cmd = ActionUtil.getPhantomPowerCommand(sel)
				if (cmd) unsubscribeFeedback(subs, cmd, event)
			},
		},

		[FeedbackId.GainCompActive]: {
			type: 'boolean',
			name: 'Gain Comp - Auto Active',
			description: 'Active when gain compensation is enabled in auto mode.',
			defaultStyle: { color: combineRgb(0, 0, 0), bgcolor: combineRgb(0, 200, 0) },
			options: [],
			callback: () => {
				return _self.gainCompHandler?.isEnabled() === true && _self.gainCompHandler?.getMode() === 'auto'
			},
			subscribe: () => {},
			unsubscribe: () => {},
		},

		[FeedbackId.GainCompManualActive]: {
			type: 'boolean',
			name: 'Gain Comp - Manual Active',
			description: 'Active when gain compensation is enabled in manual mode.',
			defaultStyle: { color: combineRgb(0, 0, 0), bgcolor: combineRgb(220, 140, 0) },
			options: [],
			callback: () => {
				return _self.gainCompHandler?.isEnabled() === true && _self.gainCompHandler?.getMode() === 'manual'
			},
			subscribe: () => {},
			unsubscribe: () => {},
		},

		[FeedbackId.GainCompSnapshotExists]: {
			type: 'boolean',
			name: 'Gain Comp - Snapshot Exists',
			description: 'Active when a gain compensation snapshot has been taken.',
			defaultStyle: { color: combineRgb(255, 255, 255), bgcolor: combineRgb(0, 80, 160) },
			options: [],
			callback: () => {
				return _self.gainCompHandler?.hasSnapshot() === true
			},
			subscribe: () => {},
			unsubscribe: () => {},
		},

		[FeedbackId.ChannelNeedsComp]: {
			type: 'boolean',
			name: 'Gain Comp - Channel Needs Compensation',
			description: 'Active when a channel trim is out of sync with the compensation reference.',
			defaultStyle: { color: combineRgb(0, 0, 0), bgcolor: combineRgb(220, 140, 0) },
			options: [...GetDropdownWithVariables('Channel', 'channel', state.namedChoices.channels)],
			callback: (event) => {
				const channel = ActionUtil.getStringWithVariables(event, 'channel')
				const ch = ActionUtil.getNodeNumberFromID(channel)
				return _self.gainCompHandler?.isChannelCompOk(ch) === false
			},
			subscribe: () => {},
			unsubscribe: () => {},
		},

		[FeedbackId.GainDisplay]: {
			type: 'boolean',
			name: 'Gain Comp - Live Gain/Trim Display',
			description:
				'Overrides button text with live G:/T:/Δ values on every gain change. ' +
				'More reliable than variables for rapid updates — driven by checkFeedbacks, ' +
				'not variable batching. Use on the Gain Comp strip preset.',
			defaultStyle: {},
			options: [...GetDropdownWithVariables('Channel', 'channel', state.namedChoices.channels)],
			callback: (event) => {
				const channel = ActionUtil.getStringWithVariables(event, 'channel')
				const ch = Number(ActionUtil.getNodeNumberFromID(channel))
				const handler = _self.gainCompHandler
				if (!handler) return false
				const gain = handler['gainCache']?.get(ch)
				const trim = handler['trimCache']?.get(ch)
				const delta = handler.getCompDelta(ch)
				const gainStr = gain !== undefined ? `${Math.round(gain * 10) / 10}` : '—'
				const trimStr = trim !== undefined ? `${Math.round(trim * 10) / 10}` : '—'
				const deltaStr = delta !== undefined ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}` : ''
				const name = state.namedChoices.channels.find((c) => c.id === channel)?.label ?? `CH${ch}`
				return {
					text: `${name}\nG: ${gainStr}dB \nT: ${trimStr}dB\nΔ${deltaStr}dB`,
				} as any
			},
			subscribe: () => {},
			unsubscribe: () => {},
		},

		// Placeholder — advanced type, defined below.
		[FeedbackId.GainQueueSlot]: undefined,

		// Placeholder — FaderDisplay is advanced type, defined below.
		[FeedbackId.FaderDisplay]: undefined,

		// Placeholder — overridden below by advancedFeedbacks spread.
		[FeedbackId.StripColour]: undefined,
	}

	// Advanced feedbacks return full style objects directly — no user config needed.
	const faderDisplayStrips = [
		...state.namedChoices.channels,
		...state.namedChoices.auxes,
		...state.namedChoices.busses,
		...state.namedChoices.matrices,
		...state.namedChoices.mains,
		...state.namedChoices.dcas,
	]
	const slotChoices = Array.from({ length: GAIN_QUEUE_SLOTS }, (_, i) => ({
		id: String(i + 1),
		label: `Slot ${i + 1}`,
	}))

	const advancedFeedbacks = {
		[FeedbackId.GainQueueSlot]: {
			type: 'advanced' as const,
			name: 'Gain Comp - Queue Slot',
			description:
				'Shows the channel pending gain compensation at the given queue position. Blank when the slot is empty.',
			options: [GetDropdown('Slot', 'slot', slotChoices)],
			callback: (event: CompanionFeedbackInfo): CompanionAdvancedFeedbackResult => {
				const slot = parseInt(event.options['slot'] as string)
				const handler = _self.gainCompHandler
				if (!handler) return {}
				const ch = handler.getQueueSlot(slot)
				if (ch === undefined) {
					return {
						text: `#${slot}\nGain Comp\nempty`,
						bgcolor: combineRgb(20, 20, 20),
						color: combineRgb(80, 80, 80),
						size: 'auto',
					}
				}
				const name = _self.stateHandler?.state?.names.channels[ch - 1] ?? `CH${ch}`
				const delta = handler.getCompDelta(ch)
				const deltaStr = delta !== undefined ? `Δ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}dB` : ''
				const gain = handler['gainCache']?.get(ch)
				const trim = handler['trimCache']?.get(ch)
				const gainStr = gain !== undefined ? `${Math.round(gain * 10) / 10}` : '—'
				const trimStr = trim !== undefined ? `${Math.round(trim * 10) / 10}` : '—'
				return {
					text: `#${slot} ch${ch}\n${name}\n${deltaStr}\n${gainStr} | ${trimStr}`,
					bgcolor: combineRgb(180, 90, 0),
					color: combineRgb(255, 255, 255),
					size: 'auto',
				}
			},
			subscribe: () => {},
			unsubscribe: () => {},
		},
		[FeedbackId.FaderDisplay]: {
			type: 'advanced' as const,
			name: 'Fader - Live Level Display',
			description: 'Shows current fader level with a visual bar. Use on fader display presets.',
			options: [...GetDropdownWithVariables('Strip', 'sel', faderDisplayStrips)],
			callback: (event: CompanionFeedbackInfo): CompanionAdvancedFeedbackResult => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const st = _self.stateHandler?.state
				if (!st) return {}
				const db = getActualFromState(`${sel}/fdr`, st)
				const nameRaw = (st.get(`${sel}/$name`) ?? st.get(`${sel}/name`))?.[0]?.value
				const name: string = typeof nameRaw === 'string' ? nameRaw : sel.replace(/^\//, '').toUpperCase()
				let bar = '░░░░░'
				let color = combineRgb(200, 200, 200)
				if (db !== undefined) {
					const filled = Math.max(0, Math.min(5, Math.round(((db + 60) / 70) * 5)))
					bar = '█'.repeat(filled) + '░'.repeat(5 - filled)
					if (db >= 0) color = combineRgb(255, 220, 0)
					else if (db >= -12) color = combineRgb(100, 220, 100)
					else if (db >= -40) color = combineRgb(180, 220, 100)
					else color = combineRgb(150, 150, 150)
				}
				const dbStr = db !== undefined ? (db === -144 ? '−∞' : `${db >= 0 ? '+' : ''}${db.toFixed(1)}`) : '---'
				return { text: `${name}\n${bar}\n${dbStr}dB`, color, size: 14 }
			},
			subscribe: (event: CompanionFeedbackInfo) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				subs.subscribe(`${sel}/fdr`, event.id, FeedbackId.FaderDisplay)
				ensureLoaded(`${sel}/fdr`)
				ensureLoaded(`${sel}/$name`)
			},
			unsubscribe: (event: CompanionFeedbackInfo) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				subs.unsubscribe(`${sel}/fdr`, event.id)
			},
		},
		[FeedbackId.StripColour]: {
			type: 'advanced' as const,
			name: 'Strip - Colour Sync',
			description:
				'Sets the button background colour to match the strip colour on the Wing desk. ' +
				'Add to any button to keep it visually in sync with the desk layout.',
			options: [
				...GetDropdownWithVariables('Strip', 'sel', [
					...state.namedChoices.channels,
					...state.namedChoices.auxes,
					...state.namedChoices.busses,
					...state.namedChoices.matrices,
					...state.namedChoices.mains,
					...state.namedChoices.dcas,
				]),
			],
			callback: (event: CompanionFeedbackInfo): CompanionAdvancedFeedbackResult => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				const st = _self.stateHandler?.state
				if (!st) return {}
				const valDollar = getActualFromState(`${sel}/$col`, st)
				const valCol = getActualFromState(`${sel}/col`, st)
				// Wing sends 0-based colour indices; documentation labels them 1-18
				const idx = Math.round(valDollar ?? valCol ?? -1) + 1
				return {
					bgcolor: WING_STRIP_COLOURS[idx] ?? combineRgb(40, 40, 40),
					color: WING_STRIP_TEXT_COLOURS[idx] ?? combineRgb(255, 255, 255),
				}
			},
			subscribe: (event: CompanionFeedbackInfo) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				subs.subscribe(`${sel}/$col`, event.id, FeedbackId.StripColour)
				ensureLoaded(`${sel}/$col`)
			},
			unsubscribe: (event: CompanionFeedbackInfo) => {
				const sel = ActionUtil.getStringWithVariables(event, 'sel')
				subs.unsubscribe(`${sel}/$col`, event.id)
			},
		},
	}

	return foldSubscribeIntoCallback({ ...feedbacks, ...advancedFeedbacks })
}

// Wing strip colour palette — indices 1-18 from official Wing documentation.
const WING_STRIP_COLOURS: Record<number, number> = {
	0: combineRgb(40, 40, 40), // Default / unset
	1: combineRgb(56, 88, 192), // Blue (medium)
	2: combineRgb(40, 136, 224), // Blue (royal)
	3: combineRgb(104, 48, 216), // Violet
	4: combineRgb(32, 184, 176), // Teal / Cyan
	5: combineRgb(48, 168, 48), // Green
	6: combineRgb(32, 128, 64), // Green (dark)
	7: combineRgb(240, 210, 20), // Yellow
	8: combineRgb(160, 96, 32), // Brown
	9: combineRgb(192, 48, 64), // Red
	10: combineRgb(232, 136, 128), // Salmon
	11: combineRgb(240, 32, 200), // Magenta
	12: combineRgb(144, 53, 197), // Purple
	13: combineRgb(240, 168, 32), // Orange
	14: combineRgb(72, 180, 232), // Sky Blue
	15: combineRgb(232, 80, 48), // Coral
	16: combineRgb(48, 200, 152), // Mint
	17: combineRgb(144, 144, 144), // Gray
	18: combineRgb(216, 216, 216), // White
}

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const WING_STRIP_TEXT_COLOURS: Record<number, number> = {
	0: WHITE,
	1: WHITE, // Blue (medium)
	2: WHITE, // Blue (royal)
	3: WHITE, // Violet
	4: BLACK, // Teal / Cyan
	5: WHITE, // Green
	6: WHITE, // Green (dark)
	7: BLACK, // Yellow
	8: WHITE, // Brown
	9: WHITE, // Red
	10: BLACK, // Salmon
	11: WHITE, // Magenta
	12: WHITE, // Purple
	13: BLACK, // Orange
	14: BLACK, // Sky Blue
	15: WHITE, // Coral
	16: BLACK, // Mint
	17: BLACK, // Gray
	18: BLACK, // White
}
