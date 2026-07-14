import {
	combineRgb,
	CompanionPresetDefinitions,
	CompanionSimplePresetDefinition,
	CompanionLayeredButtonPresetDefinition,
	CompanionPresetSection,
	SomeButtonGraphicsElement,
} from '@companion-module/base'
import { InstanceBaseExt, WingSchema } from './types.js'
import { WingConfig } from './config.js'

/**
 * A Companion base v2 preset (simple or layered), extended with the module-local `category`
 * used to build the preset section structure. `category` is stripped before the definitions
 * are handed to Companion; {@link buildPresetStructure} reads it to group presets into sections.
 */
type WingPreset = (CompanionSimplePresetDefinition<WingSchema> | CompanionLayeredButtonPresetDefinition<WingSchema>) & {
	category: string
}

/**
 * Group presets into sections by their `category`. Base v2 moved preset grouping out of
 * the individual definitions and into the section structure passed to setPresetDefinitions.
 */
function buildPresetStructure(presets: { [id: string]: WingPreset | undefined }): CompanionPresetSection<WingSchema>[] {
	const byCategory = new Map<string, string[]>()
	for (const [id, preset] of Object.entries(presets)) {
		if (!preset) continue
		const ids = byCategory.get(preset.category) ?? []
		ids.push(id)
		byCategory.set(preset.category, ids)
	}
	return [...byCategory.entries()].map(([category, ids]) => ({
		id: category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
		name: category,
		definitions: ids,
	}))
}
import { CommonActions } from './actions/common.js'
import { OtherActionId } from './actions/control.js'
import { FeedbackId } from './feedbacks.js'
import { ConfigActions } from './actions/config.js'
import { FxActionId } from './actions/fx.js'
import { EffectCommands } from './commands/effect.js'
import { CardsActionId } from './actions/cards.js'
import { UsbPlayerActionId } from './actions/usbplayer.js'
import { TalkbackSwitcherActionId } from './actions/talkback.js'
import { GAIN_QUEUE_SLOTS } from './handlers/gain-compensation-handler.js'
import { BusActions } from './actions/bus.js'

export function GetPresets(_instance: InstanceBaseExt<WingConfig>): {
	structure: CompanionPresetSection<WingSchema>[]
	presets: CompanionPresetDefinitions<WingSchema>
} {
	const model = _instance.model

	const presets: {
		[id: string]: WingPreset | undefined
	} = {}

	presets['global-main-input'] = getGlobalMainAltPreset(0, 'MAIN')
	presets['global-alt-input'] = getGlobalMainAltPreset(1, 'ALT')
	presets['global-main-alt-toggle'] = getGlobalMainAltTogglePreset()

	for (let i = 1; i <= model.channels; i++) {
		presets[`ch${i}-alt-source`] = getChannelAltSourcePreset('ch', i)
		presets[`ch${i}-mute-button`] = getMutePreset('ch', i)
		presets[`ch${i}-solo-button`] = getSoloPreset('ch', i)
		presets[`ch${i}-boost-and-center-button`] = getBoostAndCenterPreset('ch', i)
		presets[`ch${i}-sof-button`] = getSofPresets('ch', i)
		presets[`ch${i}-phase-invert`] = getPhaseInvertPreset('ch', i)
		presets[`ch${i}-width-knob`] = getWidthKnobPreset('ch', i)
		presets[`ch${i}-trim-reset`] = getTrimResetPreset('ch', i)
		presets[`ch${i}-nominal`] = getFaderPreset('ch', i, 0, 'Nominal')
		presets[`ch${i}-cut`] = getFaderPreset('ch', i, -144, 'Cut')
		presets[`ch${i}-phantom`] = getPhantomPreset('ch', i)
		presets[`ch${i}-reset`] = getChannelResetPreset('ch', i)
		presets[`ch${i}-batch-kill-sends`] = getBatchKillSendsPreset('ch', i)
		presets[`ch${i}-fader-display`] = getFaderDisplayPreset('ch', i)
		presets[`ch${i}-colour-mute`] = getColourMutePreset('ch', i)
	}

	for (let i = 1; i <= model.busses; i++) {
		for (let ch = 1; ch <= Math.min(model.channels, 8); ch++) {
			presets[`ch${ch}-bus${i}-send-mode`] = getSendModePreset(ch, i)
			presets[`ch${ch}-bus${i}-send-level`] = getSendLevelKnobPreset(ch, i)
		}
	}

	for (let i = 1; i <= model.auxes; i++) {
		presets[`aux${i}-mute-button`] = getMutePreset('aux', i)
		presets[`aux${i}-solo-button`] = getSoloPreset('aux', i)
		presets[`aux${i}-boost-and-center-button`] = getBoostAndCenterPreset('aux', i)
		presets[`aux${i}-sof-button`] = getSofPresets('aux', i)
		presets[`aux${i}-trim-reset`] = getTrimResetPreset('aux', i)
		presets[`aux${i}-nominal`] = getFaderPreset('aux', i, 0, 'Nominal')
		presets[`aux${i}-cut`] = getFaderPreset('aux', i, -144, 'Cut')
		presets[`aux${i}-phantom`] = getPhantomPreset('aux', i)
		presets[`aux${i}-reset`] = getChannelResetPreset('aux', i)
		presets[`aux${i}-fader-display`] = getFaderDisplayPreset('aux', i)
	}

	for (let i = 1; i <= model.busses; i++) {
		presets[`bus${i}-mute-button`] = getMutePreset('bus', i)
		presets[`bus${i}-solo-button`] = getSoloPreset('bus', i)
		presets[`bus${i}-sof-button`] = getSofPresets('bus', i)
		presets[`bus${i}-nominal`] = getFaderPreset('bus', i, 0, 'Nominal')
		presets[`bus${i}-cut`] = getFaderPreset('bus', i, -144, 'Cut')
		presets[`bus${i}-fader-display`] = getFaderDisplayPreset('bus', i)
		presets[`bus${i}-colour-mute`] = getColourMutePreset('bus', i)
		presets[`bus${i}-master-remaster-plus1`] = getRemasterPreset('bus', i, 1)
		presets[`bus${i}-master-remaster-minus1`] = getRemasterPreset('bus', i, -1)
	}

	presets['selected-remaster-plus1'] = getRemasterSelectedPreset(1)
	presets['selected-remaster-minus1'] = getRemasterSelectedPreset(-1)

	for (let i = 1; i <= model.matrices; i++) {
		presets[`mtx${i}-mute-button`] = getMutePreset('mtx', i)
		presets[`mtx${i}-solo-button`] = getSoloPreset('mtx', i)
		presets[`mtx${i}-sof-button`] = getSofPresets('mtx', i)
		presets[`mtx${i}-nominal`] = getFaderPreset('mtx', i, 0, 'Nominal')
		presets[`mtx${i}-cut`] = getFaderPreset('mtx', i, -144, 'Cut')
		presets[`mtx${i}-fader-display`] = getFaderDisplayPreset('mtx', i)
		presets[`mtx${i}-remaster-plus1`] = getRemasterPreset('mtx', i, 1)
		presets[`mtx${i}-remaster-minus1`] = getRemasterPreset('mtx', i, -1)
	}

	for (let i = 1; i <= model.mains; i++) {
		presets[`main${i}-mute-button`] = getMutePreset('main', i)
		presets[`main${i}-solo-button`] = getSoloPreset('main', i)
		presets[`main${i}-sof-button`] = getSofPresets('main', i)
		presets[`main${i}-nominal`] = getFaderPreset('main', i, 0, 'Nominal')
		presets[`main${i}-cut`] = getFaderPreset('main', i, -144, 'Cut')
		presets[`main${i}-fader-display`] = getFaderDisplayPreset('main', i)
		presets[`main${i}-remaster-plus1`] = getRemasterPreset('main', i, 1)
		presets[`main${i}-remaster-minus1`] = getRemasterPreset('main', i, -1)
	}

	for (let i = 1; i <= model.dcas; i++) {
		presets[`dca${i}-mute-button`] = getMutePreset('dca', i)
		presets[`dca${i}-solo-button`] = getSoloPreset('dca', i)
		presets[`dca${i}-nominal`] = getFaderPreset('dca', i, 0, 'Nominal')
		presets[`dca${i}-cut`] = getFaderPreset('dca', i, -144, 'Cut')
		presets[`dca${i}-momentary-mute`] = getDcaMomentaryMutePreset(i)
		presets[`dca${i}-mute-toggle`] = getDcaToggleMutePreset(i)
		presets[`dca${i}-fader-display`] = getFaderDisplayPreset('dca', i)
	}

	for (let i = 1; i <= model.mutegroups; i++) {
		presets[`mgrp${i}-toggle`] = getMuteGroupTogglePreset(i)
		presets[`mgrp${i}-momentary`] = getMuteGroupMomentaryPreset(i)
	}
	presets['mgrp-release-all'] = getMuteGroupReleaseAllPreset()

	presets[`talkback-a-button`] = getTalkbackPreset('A')
	presets[`talkback-b-button`] = getTalkbackPreset('B')
	presets['talkback-a-latch'] = getTalkbackLatchPreset('A')
	presets['talkback-b-latch'] = getTalkbackLatchPreset('B')

	// ── Talkback Switcher ────────────────────────────────────────────────────
	const swState = _instance.stateHandler?.state
	const tbSwDestinations = [
		...(swState?.namedChoices.busses ?? []),
		...(swState?.namedChoices.matrices ?? []),
		...(swState?.namedChoices.mains ?? []),
	]
	const tbSwNames = {
		busses: swState?.names.busses ?? [],
		matrices: swState?.names.matrices ?? [],
		mains: swState?.names.mains ?? [],
	}

	presets['tbsw-a-all'] = getTbSwAllCallPreset('A')
	presets['tbsw-b-all'] = getTbSwAllCallPreset('B')
	presets['tbsw-a-back'] = getTbSwBackPreset('A')
	presets['tbsw-b-back'] = getTbSwBackPreset('B')
	presets['tbsw-a-off'] = getTbSwOffPreset('A')
	presets['tbsw-b-off'] = getTbSwOffPreset('B')
	presets['tbsw-a-ptt'] = getTbSwPttPreset('A')
	presets['tbsw-b-ptt'] = getTbSwPttPreset('B')
	presets['tbsw-ab-ptt'] = getTbSwDualPttPreset()
	presets['tbsw-ab-all'] = getTbSwDualAllCallPreset()

	for (const dest of tbSwDestinations) {
		const destId = dest.id as string
		const idx = parseInt(destId.split('/')[2]) - 1
		const destName = (() => {
			if (destId.startsWith('/bus/')) return tbSwNames.busses[idx] ?? dest.label
			if (destId.startsWith('/mtx/')) return tbSwNames.matrices[idx] ?? dest.label
			return tbSwNames.mains[idx] ?? dest.label
		})()
		const safeKey = destId.replace(/\//g, '-').replace(/^-/, '')
		presets[`tbsw-a-${safeKey}`] = getTbSwExclusivePreset('A', destId, destName, combineRgb(180, 80, 0))
		presets[`tbsw-b-${safeKey}`] = getTbSwExclusivePreset('B', destId, destName, combineRgb(160, 0, 0))
		presets[`tbsw-a-add-${safeKey}`] = getTbSwAdditivePreset('A', destId, destName, combineRgb(180, 80, 0))
		presets[`tbsw-b-add-${safeKey}`] = getTbSwAdditivePreset('B', destId, destName, combineRgb(160, 0, 0))
	}

	for (let i = 1; i <= model.busses; i++) {
		presets[`mon-bus${i}-master`] = getMonitorMasterPreset(i)
		for (let ch = 1; ch <= model.channels; ch++) {
			presets[`mon-ch${ch}-bus${i}-send`] = getMonitorSendPreset(ch, i)
		}
	}

	presets['stat-aes50-a'] = getAes50StatusPreset('A')
	presets['stat-aes50-b'] = getAes50StatusPreset('B')
	presets['stat-aes50-c'] = getAes50StatusPreset('C')
	presets['stat-solo-clear'] = getSoloClearPreset()
	presets['solo-mode-toggle'] = getSoloModePreset()
	presets['solo-mon-spk'] = getSoloMonitorPreset('SPK', 'Speaker')
	presets['solo-mon-ph'] = getSoloMonitorPreset('PH', 'Phones')
	presets['solo-mon-both'] = getSoloMonitorPreset('PH+SPK', 'Both')

	presets['scene-prev'] = getSceneStepPreset('PREV')
	presets['scene-next'] = getSceneStepPreset('NEXT')
	presets['scene-status'] = getSceneStatusPreset()
	for (let i = 1; i <= 16; i++) {
		presets[`scene-direct-${i}`] = getSceneDirectPreset(i)
	}

	for (let i = 1; i <= model.effects; i++) {
		presets[`fx${i}-bypass-button`] = getFxBypassPreset(i)
		presets[`fx${i}-mix-knob`] = getFxMixKnobPreset(i)
		presets[`fx${i}-scroll-reverb`] = getFxScrollPreset(i, 'reverb')
		presets[`fx${i}-scroll-delay`] = getFxScrollPreset(i, 'delay')
		presets[`fx${i}-predelay-knob`] = getFxReverbParamKnobPreset(i, 'pdel', 'Pre-Dly', 1, 0)
		presets[`fx${i}-decay-knob`] = getFxReverbParamKnobPreset(i, 'dcy', 'Decay', 0.1, 1.5)
		presets[`fx${i}-size-knob`] = getFxReverbParamKnobPreset(i, 'size', 'Size', 1, 50)
		presets[`fx${i}-delaytime-knob`] = getFxDelayParamKnobPreset(i, 'time', 'Time', 10, 250)
		presets[`fx${i}-delayfeed-knob`] = getFxDelayParamKnobPreset(i, 'feed', 'Feed', 5, 30)
		presets[`fx${i}-param-knob`] = getFxEffectParamKnobPreset(i)
	}

	for (let card = 1; card <= 2; card++) {
		presets[`wlive-${card}-status`] = getWLiveStatusPreset(card)
		presets[`wlive-${card}-rec`] = getWLiveTransportPreset(card, 'REC')
		presets[`wlive-${card}-play`] = getWLiveTransportPreset(card, 'PLAY')
		presets[`wlive-${card}-stop`] = getWLiveTransportPreset(card, 'STOP')
		presets[`wlive-${card}-pause`] = getWLiveTransportPreset(card, 'PPAUSE')
		presets[`wlive-${card}-marker-add`] = getWLiveAddMarkerPreset(card)
		for (let m = 1; m <= 10; m++) {
			presets[`wlive-${card}-marker-${m}`] = getWLiveGotoMarkerPreset(card, m)
		}
		presets[`wlive-${card}-sd-free`] = getWLiveSdFreePreset(card)
		presets[`wlive-${card}-session-info`] = getWLiveSessionInfoPreset(card)
		presets[`wlive-${card}-open-session`] = getWLiveOpenSessionPreset(card)
	}

	// Gain compensation
	presets['comp-snapshot'] = getGainCompSnapshotPreset()
	presets['comp-auto'] = getGainCompTogglePreset('auto')
	presets['comp-manual'] = getGainCompTogglePreset('manual')
	for (let i = 1; i <= model.channels; i++) {
		presets[`comp-ch${i}`] = getGainCompChannelPreset(i)
		presets[`comp-ch${i}-strip`] = getGainCompChannelStripPreset(i)
		presets[`comp-ch${i}-gain-knob`] = getGainCompGainKnobPreset(i)
		presets[`comp-ch${i}-trim-knob`] = getGainCompTrimKnobPreset(i)
	}
	for (let slot = 1; slot <= GAIN_QUEUE_SLOTS; slot++) {
		presets[`comp-queue-${slot}`] = getGainQueueSlotPreset(slot)
	}

	// USB player
	presets['usb-play'] = getUsbTransportPreset('PLAY', '▶ PLAY', FeedbackId.PlayerState, 'PLAY', combineRgb(0, 160, 0))
	presets['usb-stop'] = getUsbTransportPreset('STOP', '⏹ STOP', FeedbackId.PlayerState, 'STOP', combineRgb(60, 60, 60))
	presets['usb-pause'] = getUsbTransportPreset(
		'PAUSE',
		'⏸ PAUSE',
		FeedbackId.PlayerState,
		'PAUSE',
		combineRgb(160, 130, 0),
	)
	presets['usb-next'] = getUsbTransportPreset('NEXT', '⏭ NEXT', null, null, combineRgb(0, 60, 120))
	presets['usb-prev'] = getUsbTransportPreset('PREV', '⏮ PREV', null, null, combineRgb(0, 60, 120))
	presets['usb-track-display'] = getUsbTrackDisplayPreset()

	// USB recorder
	presets['usb-rec'] = getUsbRecordPreset('REC', '⏺ REC', FeedbackId.RecorderState, 'REC', combineRgb(200, 0, 0))
	presets['usb-rec-stop'] = getUsbRecordPreset(
		'STOP',
		'⏹ STOP',
		FeedbackId.RecorderState,
		'STOP',
		combineRgb(60, 60, 60),
	)
	presets['usb-rec-pause'] = getUsbRecordPreset(
		'PAUSE',
		'⏸ PAUSE',
		FeedbackId.RecorderState,
		'PAUSE',
		combineRgb(160, 130, 0),
	)
	presets['usb-rec-newfile'] = getUsbRecordPreset('NEWFILE', '+ FILE', null, null, combineRgb(0, 60, 80))
	presets['usb-rec-status'] = getUsbRecStatusPreset()

	// Headamp gain presets (ch 1-8 as representative set)
	for (let i = 1; i <= Math.min(model.channels, 8); i++) {
		presets[`ch${i}-headamp-gain`] = getHeadampGainPreset(i)
	}

	presets[`lights-bright`] = getLightPresetBright()
	presets[`lights-dark`] = getLightPresetDark()

	const structure = buildPresetStructure(presets)

	// Strip the module-only `category` field — it is used to build the section structure
	// above and is not part of the Companion base v2 preset shape.
	const cleaned: CompanionPresetDefinitions<WingSchema> = {}
	for (const [id, preset] of Object.entries(presets)) {
		if (!preset) continue
		const { category: _category, ...definition } = preset
		cleaned[id] = definition
	}

	return { structure, presets: cleaned }
}

function getGlobalMainAltPreset(source: 0 | 1, label: string): WingPreset {
	const isAlt = source === 1
	return {
		name: `Global Input: ${label}`,
		category: 'Input Switching',
		type: 'simple',
		style: {
			text: `ALL\n${label}`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: isAlt ? combineRgb(160, 60, 0) : combineRgb(0, 80, 0),
		},
		steps: [
			{
				down: [{ actionId: CommonActions.SetGlobalMainAlt, options: { source: String(source) } }],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.MainAltSwitch,
				options: { sel: isAlt ? '0' : '1' },
				style: { bgcolor: isAlt ? combineRgb(220, 100, 0) : combineRgb(0, 160, 0) },
			},
		],
	}
}

function getGlobalMainAltTogglePreset(): WingPreset {
	return {
		name: 'Global Input: Toggle',
		category: 'Input Switching',
		type: 'simple',
		style: {
			text: `ALL\n$(wing:main_alt_status)`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(40, 40, 40),
		},
		steps: [
			{
				down: [{ actionId: CommonActions.SetGlobalMainAlt, options: { source: '-1' } }],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.MainAltSwitch,
				options: { sel: '0' },
				style: { bgcolor: combineRgb(0, 160, 0) },
			},
			{
				feedbackId: FeedbackId.MainAltSwitch,
				options: { sel: '1' },
				style: { bgcolor: combineRgb(220, 100, 0) },
			},
		],
	}
}

function getChannelAltSourcePreset(base: string, num: number): WingPreset {
	const path = `/${base}/${num}`
	const name = `${base.toUpperCase()}${num}`
	return {
		name: `${name} Alt Source Toggle`,
		category: 'Input Switching',
		type: 'simple',
		style: {
			text: `${name}\n$(wing:${base}${num}_alt)`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0),
		},
		steps: [
			{
				down: [{ actionId: CommonActions.SetMainAlt, options: { channel: path, main_alt: '-1' } }],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.ChannelAltSource,
				options: { sel: path },
				style: { bgcolor: combineRgb(200, 80, 0), color: combineRgb(255, 255, 255) },
			},
		],
	}
}

function getColourMutePreset(base: string, num: number): WingPreset {
	const path = `/${base}/${num}`
	const varName = `${base}${num}_name`
	return {
		name: `${base.toUpperCase()}${num} Colour Mute`,
		category: 'Channel Strip',
		type: 'simple',
		style: {
			text: `$(wing:${varName})`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(40, 40, 40),
		},
		steps: [{ down: [{ actionId: CommonActions.SetMute, options: { sel: path, mute: -1 } }], up: [] }],
		feedbacks: [
			// Background follows the Wing desk strip colour
			{
				feedbackId: FeedbackId.StripColour,
				options: { sel: path, sel_use_variables: false },
			},
			// Red overlay with dark text when muted
			{
				feedbackId: FeedbackId.Mute,
				options: { sel: path, mute: 1 },
				style: { color: combineRgb(255, 200, 200), bgcolor: combineRgb(180, 0, 0) },
			},
		],
	}
}

function getMutePreset(base: string, val: number): WingPreset {
	const path = `/${base}/${val}`
	return {
		name: 'Mute Button',
		category: 'Mute',
		type: 'layered',
		elements: buildStripElements(base, val, 'Mute'),
		options: {
			stepAutoProgress: true,
		},
		steps: [
			{
				down: [
					{
						actionId: CommonActions.SetMute,
						options: { sel: path, mute: -1 },
					},
				],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.Mute,
				options: { sel: path, mute: 1 },
				isInverted: false,
				styleOverrides: [
					colorOverride('text0', combineRgb(255, 255, 255)),
					colorOverride('box0', combineRgb(255, 0, 0)),
				],
			},
		],
	}
}

// Border colour per strip type, used to visually distinguish non-channel solo presets.
// Channel solo has no border. Bus is green to match the reference layout.
const STRIP_BORDER_COLORS: Record<string, number> = {
	aux: combineRgb(0, 200, 255), // cyan
	bus: combineRgb(64, 255, 64), // green
	mtx: combineRgb(180, 90, 255), // violet
	main: combineRgb(255, 140, 0), // orange
	dca: combineRgb(255, 70, 70), // red
}

// Human-readable strip label used as a fallback when a strip has no name set,
// e.g. "Bus 11" or "Main 2".
const STRIP_FALLBACK_LABEL: Record<string, string> = {
	ch: 'Ch',
	aux: 'Aux',
	bus: 'Bus',
	mtx: 'Mtx',
	main: 'Main',
	dca: 'DCA',
}

// Companion expression fragment yielding the strip name, or `fallback` when the name is empty
// OR unset. `concat('', var)` coerces an unset variable (one the console never sent a value for)
// to '' so the fallback fires — a bare `var == ''` is false for unset variables.
function nameOrFallbackExpr(nameVar: string, fallback: string): string {
	return `concat('', ${nameVar}) == '' ? '${fallback}' : ${nameVar}`
}

// A border drawn as a group of four line elements around the button edge, matching the
// Companion 5 layered-button approach (simple presets have no border property).
function stripBorderGroup(color: number): SomeButtonGraphicsElement {
	const line = (fromX: number, fromY: number, toX: number, toY: number): SomeButtonGraphicsElement => ({
		type: 'line',
		name: 'Line',
		opacity: 100,
		fromX,
		fromY,
		toX,
		toY,
		borderWidth: 4,
		borderColor: color,
		borderPosition: 'center',
	})
	return {
		id: 'border',
		name: 'Border',
		type: 'group',
		opacity: 100,
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		squareCoords: false,
		children: [
			line(100, 100, 0, 100), // bottom
			line(100, 100, 100, 0), // right
			line(0, 0, 100, 0), // top
			line(0, 0, 0, 100), // left
		],
	}
}

// Build the layered elements for a strip toggle button (solo/mute): a black background, a
// text layer showing the live strip name (falling back to e.g. "Bus 11" when unnamed), and a
// per-strip-type coloured border for non-channel strips.
function buildStripElements(base: string, val: number, label: string): SomeButtonGraphicsElement[] {
	const borderColor = STRIP_BORDER_COLORS[base]
	const fallbackLabel = `${STRIP_FALLBACK_LABEL[base] ?? base} ${val}`
	const nameVar = `$(wing:${base}${val}_name)`
	const elements: SomeButtonGraphicsElement[] = [
		{
			id: 'box0',
			name: 'Background',
			type: 'box',
			opacity: 100,
			x: 0,
			y: 0,
			width: 100,
			height: 100,
			color: combineRgb(0, 0, 0),
			borderWidth: 0,
		},
		{
			id: 'text0',
			name: 'Text',
			type: 'text',
			opacity: 100,
			x: 0,
			y: 0,
			width: 100,
			height: 100,
			// Show the live strip name, or fall back to e.g. "Bus 11" when it has no name.
			text: {
				isExpression: true,
				value: `concat('${label}\\n', ${nameOrFallbackExpr(nameVar, fallbackLabel)})`,
			},
			color: combineRgb(255, 255, 255),
			halign: 'center',
			valign: 'center',
			fontsize: 100,
			fontsizeAllowShrink: true,
			font: 'companion-sans',
			outlineColor: 4278190080, // opaque black text outline (0xFF000000)
		},
	]
	if (borderColor !== undefined) elements.push(stripBorderGroup(borderColor))
	return elements
}

// A feedback style override for an element's colour. Companion applies style-override values
// in the ExpressionOrValue wrapper form, so wrap the value explicitly.
function colorOverride(elementId: string, value: number) {
	return { elementId, elementProperty: 'color', override: { isExpression: false as const, value } }
}

function getSoloPreset(base: string, val: number): WingPreset {
	const path = `/${base}/${val}`

	return {
		name: `SoloButton`,
		category: 'Solo',
		type: 'layered',
		elements: buildStripElements(base, val, 'Solo'),
		options: {
			stepAutoProgress: true,
		},
		steps: [
			{
				down: [
					{
						actionId: CommonActions.SetSolo,
						options: {
							sel: `${path}`,
							solo: -1,
						},
					},
				],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.Solo,
				options: { sel: path, solo: '1' },
				isInverted: false,
				styleOverrides: [colorOverride('text0', combineRgb(0, 0, 0)), colorOverride('box0', combineRgb(255, 255, 0))],
			},
		],
	}
}

// A Companion-side toggle between additive and individual (exclusive) solo behaviour for all
// solo buttons. Shows the current mode and highlights green when Individual.
function getSoloModePreset(): WingPreset {
	return {
		name: 'Solo Mode (Additive / Individual)',
		category: 'Solo',
		type: 'layered',
		elements: [
			{
				id: 'box0',
				name: 'Background',
				type: 'box',
				opacity: 100,
				x: 0,
				y: 0,
				width: 100,
				height: 100,
				color: combineRgb(0, 0, 0),
				borderWidth: 0,
			},
			{
				id: 'text0',
				name: 'Text',
				type: 'text',
				opacity: 100,
				x: 0,
				y: 0,
				width: 100,
				height: 100,
				text: 'Solo Mode\nAdditive',
				color: combineRgb(255, 255, 255),
				halign: 'center',
				valign: 'center',
				fontsize: 100,
				fontsizeAllowShrink: true,
				font: 'companion-sans',
				outlineColor: 4278190080,
			},
		],
		options: {
			stepAutoProgress: true,
		},
		steps: [
			{
				down: [{ actionId: CommonActions.SetSoloMode, options: { mode: 'toggle' } }],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.SoloModeExclusive,
				options: {},
				isInverted: false,
				styleOverrides: [
					{
						elementId: 'text0',
						elementProperty: 'text',
						override: { isExpression: false as const, value: 'Solo Mode\nIndividual' },
					},
					colorOverride('box0', combineRgb(0, 150, 0)),
				],
			},
		],
	}
}

function getBoostAndCenterPreset(base: string, val: number): WingPreset {
	const path = `/${base}/${val}`
	return {
		name: 'Boost and Center Button',
		category: 'Boost',
		type: 'simple',
		style: {
			text: `Boost & Center\n$(wing:${base}${val}_name)`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0),
		},
		options: {
			stepAutoProgress: true,
		},
		steps: [
			{
				down: [
					{
						actionId: CommonActions.StoreFader,
						options: { sel: path },
					},
					{
						actionId: CommonActions.DeltaFader,
						options: {
							sel: path,
							delta: 3,
							fadeDuration: 1000,
							fadeAlgorithm: 'quadratic',
							fadeType: 'ease-in-out',
						},
					},
					{
						actionId: CommonActions.StorePanorama,
						options: { sel: path },
					},
					{
						actionId: CommonActions.SetPanorama,
						options: { sel: path, pan: 0, fadeDuration: 1000, fadeAlgorithm: 'quadratic', fadeType: 'ease-in-out' },
					},
				],
				up: [],
			},
			{
				down: [
					{
						actionId: CommonActions.RestoreFader,
						options: { sel: path, fadeDuration: 1000, fadeAlgorithm: 'quadratic', fadeType: 'ease-in-out' },
					},
					{
						actionId: CommonActions.RestorePanorama,
						options: { sel: path, fadeDuration: 1000, fadeAlgorithm: 'quadratic', fadeType: 'ease-in-out' },
					},
				],
				up: [],
			},
		],
		feedbacks: [],
	}
}

function getTalkbackPreset(talkback: 'A' | 'B'): WingPreset {
	return {
		name: `Talkback ${talkback}`,
		category: 'Talkback',
		type: 'simple',
		style: {
			text: `TB ${talkback}`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0),
		},
		steps: [
			{
				down: [{ actionId: ConfigActions.TalkbackOn, options: { tb: `${talkback}`, solo: 1 } }],
				up: [{ actionId: ConfigActions.TalkbackOn, options: { tb: `${talkback}`, solo: 0 } }],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.Talkback,
				options: { tb: `${talkback}`, on: '1' },
				style: {
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(255, 0, 0),
				},
			},
		],
	}
}

// ─── Gain compensation presets ────────────────────────────────────────────────

function getGainCompSnapshotPreset(): WingPreset {
	return {
		name: 'Gain Comp - Snapshot',
		category: 'Gain Compensation',
		type: 'simple',
		style: {
			text: 'SNAP\n$(wing:comp_snapshot_time)',
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 60, 120),
		},
		steps: [
			{
				down: [{ actionId: CommonActions.TakeGainSnapshot, options: {} }],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.GainCompSnapshotExists,
				options: {},
				style: { bgcolor: combineRgb(0, 100, 200) },
			},
		],
	}
}

function getGainCompTogglePreset(mode: 'auto' | 'manual'): WingPreset {
	const label = mode === 'auto' ? 'COMP\nAUTO' : 'COMP\nMANUAL'
	const activeBg = mode === 'auto' ? combineRgb(0, 180, 0) : combineRgb(200, 120, 0)
	const activeFeedback = mode === 'auto' ? FeedbackId.GainCompActive : FeedbackId.GainCompManualActive
	return {
		name: `Gain Comp - ${mode === 'auto' ? 'Auto' : 'Manual'} Toggle`,
		category: 'Gain Compensation',
		type: 'simple',
		style: {
			text: label,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(40, 40, 40),
		},
		steps: [
			{
				down: [{ actionId: CommonActions.ToggleGainComp, options: { mode } }],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: activeFeedback,
				options: {},
				style: { bgcolor: activeBg, color: combineRgb(0, 0, 0) },
			},
		],
	}
}

function getGainCompChannelPreset(ch: number): WingPreset {
	const path = `/ch/${ch}`
	return {
		name: `Gain Comp - CH${ch}`,
		category: 'Gain Compensation',
		type: 'simple',
		style: {
			text: `CH${ch}\n$(wing:ch${ch}_name)\nΔ$(wing:ch${ch}_comp_delta)dB`,
			size: 'auto',
			color: combineRgb(200, 200, 200),
			bgcolor: combineRgb(20, 20, 40),
		},
		steps: [
			{
				down: [{ actionId: CommonActions.CompensateChannel, options: { channel: path } }],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.ChannelNeedsComp,
				options: { channel: path },
				style: { bgcolor: combineRgb(200, 120, 0), color: combineRgb(0, 0, 0) },
			},
		],
	}
}

function getGainCompChannelStripPreset(ch: number): WingPreset {
	const path = `/ch/${ch}`
	return {
		name: `Gain Comp - CH${ch} Strip`,
		category: 'Gain Compensation',
		type: 'simple',
		style: {
			// Full channel strip display matching the idea file layout:
			text: `$(wing:ch${ch}_name)\nG: $(wing:ch${ch}_gain)dB \nT: $(wing:ch${ch}_trim)dB\nΔ$(wing:ch${ch}_comp_delta)dB`,
			size: '14',
			color: combineRgb(220, 220, 220),
			bgcolor: combineRgb(20, 20, 40),
		},
		steps: [
			{
				down: [{ actionId: CommonActions.CompensateChannel, options: { channel: path } }],
				up: [],
			},
		],
		feedbacks: [
			{
				// Amber when trim correction is pending (manual mode or out-of-sync)
				feedbackId: FeedbackId.ChannelNeedsComp,
				options: { channel: path },
				style: { bgcolor: combineRgb(180, 100, 0), color: combineRgb(0, 0, 0) },
			},
			{
				// Green when auto compensation is active
				feedbackId: FeedbackId.GainCompActive,
				options: {},
				style: { bgcolor: combineRgb(0, 80, 20), color: combineRgb(200, 255, 200) },
			},
		],
	}
}

function getGainCompGainKnobPreset(ch: number): WingPreset {
	const path = `/ch/${ch}`
	return {
		name: `Gain Comp - CH${ch} Gain Knob`,
		category: 'Gain Compensation',
		type: 'simple',
		style: {
			text: `CH${ch}\nG:$(wing:ch${ch}_gain)dB`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(40, 20, 60),
		},
		steps: [
			{
				down: [],
				up: [],
				rotate_left: [{ actionId: CommonActions.AdjustHeadampGain, options: { channel: path, step: -2.5 } }],
				rotate_right: [{ actionId: CommonActions.AdjustHeadampGain, options: { channel: path, step: 2.5 } }],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.ChannelNeedsComp,
				options: { channel: path },
				style: { bgcolor: combineRgb(180, 100, 0), color: combineRgb(0, 0, 0) },
			},
		],
	}
}

function getGainCompTrimKnobPreset(ch: number): WingPreset {
	const path = `/ch/${ch}`
	return {
		name: `Gain Comp - CH${ch} Trim Knob`,
		category: 'Gain Compensation',
		type: 'simple',
		style: {
			text: `CH${ch}\nT:$(wing:ch${ch}_trim)dB`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(20, 50, 60),
		},
		steps: [
			{
				down: [{ actionId: CommonActions.ResetTrim, options: { sel: path } }],
				up: [],
				rotate_left: [{ actionId: CommonActions.AdjustTrim, options: { sel: path, step: -0.5 } }],
				rotate_right: [{ actionId: CommonActions.AdjustTrim, options: { sel: path, step: 0.5 } }],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.ChannelNeedsComp,
				options: { channel: path },
				style: { bgcolor: combineRgb(180, 100, 0), color: combineRgb(0, 0, 0) },
			},
		],
	}
}

function getLightPresetBright(): WingPreset {
	return {
		name: 'Lights: Bright',
		category: 'Lighting',
		type: 'simple',
		style: {
			text: 'Lights\\nBright',
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0),
		},
		steps: [
			{
				down: [
					{
						actionId: OtherActionId.SetLightIntensities,
						options: {
							lamp: '100',
							btns: '100',
							leds: '100',
							meters: '100',
							rgbleds: '100',
							chlcds: '80',
							chlcdctr: '50',
							chedit: '100',
							main: '100',
							glow: '100',
							patch: '100',
							fadeDuration: 1000,
							fadeAlgorithm: 'linear',
							snapToGrid: false,
						},
					},
				],
				up: [],
			},
		],
		feedbacks: [],
	}
}

// ─── USB presets ──────────────────────────────────────────────────────────────

function getUsbTransportPreset(
	action: string,
	label: string,
	feedbackId: FeedbackId | null,
	feedbackState: string | null,
	activeColor: number,
): WingPreset {
	return {
		name: `USB Player: ${label}`,
		category: 'USB Player',
		type: 'simple',
		style: { text: label, size: 'auto', color: combineRgb(255, 255, 255), bgcolor: combineRgb(0, 0, 0) },
		steps: [
			{
				down: [{ actionId: UsbPlayerActionId.PlaybackAction, options: { action } }],
				up: [],
			},
		],
		feedbacks:
			feedbackId && feedbackState
				? [
						{
							feedbackId,
							options: { state: feedbackState },
							style: { bgcolor: activeColor, color: combineRgb(255, 255, 255) },
						},
					]
				: [],
	}
}

function getUsbTrackDisplayPreset(): WingPreset {
	return {
		name: 'USB Player: Track Display',
		category: 'USB Player',
		type: 'simple',
		style: {
			text: '$(wing:play_song)\n$(wing:play_pos_mm_ss) / $(wing:play_length_mm_ss)',
			size: 'auto',
			color: combineRgb(200, 200, 200),
			bgcolor: combineRgb(20, 20, 40),
		},
		steps: [{ down: [], up: [] }],
		feedbacks: [
			{
				feedbackId: FeedbackId.PlayerState,
				options: { state: 'PLAY' },
				style: { bgcolor: combineRgb(0, 60, 20) },
			},
		],
	}
}

function getUsbRecordPreset(
	action: string,
	label: string,
	feedbackId: FeedbackId | null,
	feedbackState: string | null,
	activeColor: number,
): WingPreset {
	return {
		name: `USB Recorder: ${label}`,
		category: 'USB Recorder',
		type: 'simple',
		style: { text: label, size: 'auto', color: combineRgb(255, 255, 255), bgcolor: combineRgb(0, 0, 0) },
		steps: [
			{
				down: [{ actionId: UsbPlayerActionId.RecordAction, options: { action } }],
				up: [],
			},
		],
		feedbacks:
			feedbackId && feedbackState
				? [
						{
							feedbackId,
							options: { state: feedbackState },
							style: { bgcolor: activeColor, color: combineRgb(255, 255, 255) },
						},
					]
				: [],
	}
}

function getUsbRecStatusPreset(): WingPreset {
	return {
		name: 'USB Recorder: Status',
		category: 'USB Recorder',
		type: 'simple',
		style: {
			text: '$(wing:rec_state)\n$(wing:rec_elapsed_mm_ss)',
			size: 'auto',
			color: combineRgb(200, 200, 200),
			bgcolor: combineRgb(40, 20, 20),
		},
		steps: [{ down: [], up: [] }],
		feedbacks: [
			{
				feedbackId: FeedbackId.RecorderState,
				options: { state: 'REC' },
				style: { bgcolor: combineRgb(160, 0, 0), color: combineRgb(255, 200, 200) },
			},
			{
				feedbackId: FeedbackId.RecorderState,
				options: { state: 'PAUSE' },
				style: { bgcolor: combineRgb(140, 100, 0), color: combineRgb(255, 255, 200) },
			},
		],
	}
}

function getHeadampGainPreset(ch: number): WingPreset {
	const path = `/ch/${ch}`
	return {
		name: `CH${ch} Headamp Gain`,
		category: 'Input Processing',
		type: 'simple',
		style: {
			text: `CH${ch}\n$(wing:ch${ch}_gain)dB`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(40, 20, 60),
		},
		steps: [
			{
				down: [],
				up: [],
				rotate_left: [{ actionId: CommonActions.AdjustHeadampGain, options: { channel: path, step: -2.5 } }],
				rotate_right: [{ actionId: CommonActions.AdjustHeadampGain, options: { channel: path, step: 2.5 } }],
			},
		],
		feedbacks: [],
	}
}

function getLightPresetDark(): WingPreset {
	return {
		name: 'Lights: Dark',
		category: 'Lighting',
		type: 'simple',
		style: {
			text: 'Lights\\nDark',
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0),
		},
		steps: [
			{
				down: [
					{
						actionId: OtherActionId.SetLightIntensities,
						options: {
							lamp: '10',
							btns: '80',
							leds: '40',
							meters: '30',
							rgbleds: '10',
							chlcds: '30',
							chlcdctr: '50',
							chedit: '10',
							main: '10',
							glow: '10',
							patch: '10',
							fadeDuration: 1000,
							fadeAlgorithm: 'linear',
							snapToGrid: false,
						},
					},
				],
				up: [],
			},
		],
		feedbacks: [],
	}
}

function getFxBypassPreset(slot: number): WingPreset {
	const path = EffectCommands.Node(slot)
	return {
		name: 'FX Bypass Toggle',
		category: 'FX',
		type: 'simple',
		style: {
			text: `FX${slot}\n$(wing:fx${slot}_model)`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0),
		},
		steps: [
			{
				down: [{ actionId: FxActionId.SetFxInsertOn, options: { slot: path, enable: -1 } }],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.FxInsertOn,
				options: { slot: path },
				style: {
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 180, 0),
				},
			},
		],
	}
}

function getFxMixKnobPreset(slot: number): WingPreset {
	const path = EffectCommands.Node(slot)
	return {
		name: `FX${slot} Mix Knob`,
		category: 'FX',
		type: 'simple',
		style: {
			text: `FX${slot}\nMix\n$(wing:fx${slot}_fxmix)%`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 60, 120),
		},
		steps: [
			{
				down: [{ actionId: FxActionId.SetFxMix, options: { slot: path, mix: 100, fadeDuration: 0 } }],
				up: [],
				rotate_left: [{ actionId: FxActionId.AdjustFxMix, options: { slot: path, step: -5 } }],
				rotate_right: [{ actionId: FxActionId.AdjustFxMix, options: { slot: path, step: 5 } }],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.FxInsertOn,
				options: { slot: path },
				style: { color: combineRgb(255, 255, 255), bgcolor: combineRgb(0, 60, 120) },
			},
		],
	}
}

function getFxScrollPreset(slot: number, group: string): WingPreset {
	const path = EffectCommands.Node(slot)
	const label = group.charAt(0).toUpperCase() + group.slice(1)
	return {
		name: `FX${slot} Scroll ${label}`,
		category: 'FX',
		type: 'simple',
		style: {
			text: `FX${slot}\n$(wing:fx${slot}_model)\n◀ ${label} ▶`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(80, 0, 100),
		},
		steps: [
			{
				down: [{ actionId: FxActionId.SetFxInsertOn, options: { slot: path, enable: -1 } }],
				up: [],
				rotate_left: [
					{ actionId: FxActionId.ScrollEffect, options: { slot: path, direction: 'prev', group, wrap: true } },
				],
				rotate_right: [
					{ actionId: FxActionId.ScrollEffect, options: { slot: path, direction: 'next', group, wrap: true } },
				],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.FxInsertOn,
				options: { slot: path },
				style: { color: combineRgb(255, 255, 255), bgcolor: combineRgb(160, 0, 200) },
			},
		],
	}
}

function getFxReverbParamKnobPreset(
	slot: number,
	param: string,
	label: string,
	step: number,
	resetValue: number,
): WingPreset {
	const path = EffectCommands.Node(slot)
	return {
		name: `FX${slot} Reverb ${label} Knob`,
		category: 'FX',
		type: 'simple',
		style: {
			text: `FX${slot}\n${label}`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 80, 60),
		},
		steps: [
			{
				down: [
					{ actionId: FxActionId.SetReverbParam, options: { slot: path, param, value: resetValue, fadeDuration: 0 } },
				],
				up: [],
				rotate_left: [{ actionId: FxActionId.AdjustReverbParam, options: { slot: path, param, step: -step } }],
				rotate_right: [{ actionId: FxActionId.AdjustReverbParam, options: { slot: path, param, step } }],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.FxInsertOn,
				options: { slot: path },
				style: { color: combineRgb(255, 255, 255), bgcolor: combineRgb(0, 80, 60) },
			},
		],
	}
}

// ─── WLive presets ────────────────────────────────────────────────────────────

const WLIVE_TRANSPORT_LABEL: Record<string, string> = {
	REC: '⏺ REC',
	PLAY: '▶ PLAY',
	STOP: '⏹ STOP',
	PPAUSE: '⏸ PAUSE',
}

const WLIVE_TRANSPORT_COLOR: Record<string, number> = {
	REC: 0xc80000,
	PLAY: 0x00a000,
	STOP: 0x303030,
	PPAUSE: 0xb48c00,
}

function getWLiveStatusPreset(card: number): WingPreset {
	return {
		name: `WLive ${card} - Status`,
		category: 'WLive',
		type: 'simple',
		style: {
			text: `WL${card} $(wing:wlive_${card}_state)\n$(wing:wlive_${card}_elapsed_time_hh_mm_ss)`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(30, 30, 30),
		},
		steps: [{ down: [], up: [] }],
		feedbacks: [
			{
				feedbackId: FeedbackId.WLivePlaybackState,
				options: { card: String(card), state: 'REC' },
				style: { bgcolor: combineRgb(200, 0, 0), color: combineRgb(255, 255, 255) },
			},
			{
				feedbackId: FeedbackId.WLivePlaybackState,
				options: { card: String(card), state: 'PLAY' },
				style: { bgcolor: combineRgb(0, 160, 0), color: combineRgb(255, 255, 255) },
			},
			{
				feedbackId: FeedbackId.WLivePlaybackState,
				options: { card: String(card), state: 'PPAUSE' },
				style: { bgcolor: combineRgb(180, 140, 0), color: combineRgb(255, 255, 255) },
			},
		],
	}
}

function getWLiveTransportPreset(card: number, action: string): WingPreset {
	const label = WLIVE_TRANSPORT_LABEL[action] ?? action
	const activeColor = WLIVE_TRANSPORT_COLOR[action] ?? 0x404040
	return {
		name: `WLive ${card} - ${label}`,
		category: 'WLive',
		type: 'simple',
		style: {
			text: `WL${card}\n${label}`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0),
		},
		steps: [
			{
				down: [{ actionId: CardsActionId.CardAction, options: { card: String(card), action } }],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.WLivePlaybackState,
				options: { card: String(card), state: action },
				style: {
					bgcolor: activeColor,
					color: combineRgb(255, 255, 255),
				},
			},
		],
	}
}

function getWLiveAddMarkerPreset(card: number): WingPreset {
	return {
		name: `WLive ${card} - Add Marker`,
		category: 'WLive',
		type: 'simple',
		style: {
			text: `WL${card}\n⚑ Mark`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 80, 160),
		},
		steps: [
			{
				down: [{ actionId: CardsActionId.AddMarker, options: { card: String(card) } }],
				up: [],
			},
		],
		feedbacks: [],
	}
}

function getWLiveGotoMarkerPreset(card: number, marker: number): WingPreset {
	return {
		name: `WLive ${card} - Goto Marker ${marker}`,
		category: 'WLive',
		type: 'simple',
		style: {
			text: `WL${card}\n▶ M${marker}`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 60, 120),
		},
		steps: [
			{
				down: [{ actionId: CardsActionId.GotoMarker, options: { card: String(card), marker } }],
				up: [],
			},
		],
		feedbacks: [],
	}
}

function getWLiveSdFreePreset(card: number): WingPreset {
	return {
		name: `WLive ${card} - SD Free`,
		category: 'WLive',
		type: 'simple',
		style: {
			text: `WL${card} SD\n$(wing:wlive_${card}_sdfree_hh_mm_ss)\nfree`,
			size: 'auto',
			color: combineRgb(200, 200, 200),
			bgcolor: combineRgb(20, 40, 20),
		},
		steps: [{ down: [], up: [] }],
		feedbacks: [
			{
				feedbackId: FeedbackId.WLiveSDState,
				options: { card: String(card), state: 'READY' },
				style: { bgcolor: combineRgb(20, 60, 20), color: combineRgb(200, 255, 200) },
			},
			{
				feedbackId: FeedbackId.WLiveSDState,
				options: { card: String(card), state: 'ERROR' },
				style: { bgcolor: combineRgb(160, 0, 0), color: combineRgb(255, 200, 200) },
			},
			{
				feedbackId: FeedbackId.WLiveSDState,
				options: { card: String(card), state: 'NONE' },
				style: { bgcolor: combineRgb(60, 60, 60), color: combineRgb(160, 160, 160) },
			},
		],
	}
}

function getWLiveSessionInfoPreset(card: number): WingPreset {
	return {
		name: `WLive ${card} - Session Info`,
		category: 'WLive',
		type: 'simple',
		style: {
			text: `WL${card}\nSess $(wing:wlive_${card}_session_current)/$(wing:wlive_${card}_session_total)\n$(wing:wlive_${card}_session_len_hh_mm_ss)`,
			size: 'auto',
			color: combineRgb(200, 200, 200),
			bgcolor: combineRgb(20, 20, 50),
		},
		steps: [{ down: [], up: [] }],
		feedbacks: [
			{
				feedbackId: FeedbackId.WLivePlaybackState,
				options: { card: String(card), state: 'REC' },
				style: { bgcolor: combineRgb(80, 0, 0), color: combineRgb(255, 200, 200) },
			},
		],
	}
}

function getWLiveOpenSessionPreset(card: number): WingPreset {
	return {
		name: `WLive ${card} - Open Session`,
		category: 'WLive',
		type: 'simple',
		style: {
			text: `WL${card}\n▶ Sess 1`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(40, 20, 80),
		},
		steps: [
			{
				down: [{ actionId: CardsActionId.OpenSession, options: { card: String(card), session: 1 } }],
				up: [],
			},
		],
		feedbacks: [],
	}
}

function getPhaseInvertPreset(base: string, num: number): WingPreset {
	const path = `/${base}/${num}`
	const name = `${base.toUpperCase()}${num}`
	return {
		name: `${name} Phase Invert`,
		category: 'Monitor Tools',
		type: 'simple',
		style: {
			text: `${name}\nΦ`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0),
		},
		steps: [
			{
				down: [{ actionId: CommonActions.SetPhaseInvert, options: { sel: path, invert: -1 } }],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.PhaseInvert,
				options: { sel: path },
				style: { color: combineRgb(255, 255, 0), bgcolor: combineRgb(180, 0, 0) },
			},
		],
	}
}

function getWidthKnobPreset(base: string, num: number): WingPreset {
	const path = `/${base}/${num}`
	const name = `${base.toUpperCase()}${num}`
	return {
		name: `${name} Width Knob`,
		category: 'Monitor Tools',
		type: 'simple',
		style: {
			text: `${name}\nWidth`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 80, 100),
		},
		steps: [
			{
				down: [{ actionId: CommonActions.SetWidth, options: { sel: path, width: 0, fadeDuration: 0 } }],
				up: [],
				rotate_left: [{ actionId: CommonActions.DeltaWidth, options: { sel: path, step: -10 } }],
				rotate_right: [{ actionId: CommonActions.DeltaWidth, options: { sel: path, step: 10 } }],
			},
		],
		feedbacks: [],
	}
}

function getSendModePreset(ch: number, bus: number): WingPreset {
	const src = `/ch/${ch}`
	const dest = `/bus/${bus}`
	return {
		name: `CH${ch}→BUS${bus} Send Mode`,
		category: 'Monitor Tools',
		type: 'simple',
		style: {
			text: `CH${ch}→B${bus}\nPRE`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0),
		},
		steps: [
			{
				down: [{ actionId: CommonActions.SetSendMode, options: { src, dest, mode: 'PRE' } }],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.SendMode,
				options: { src, dest, mode: 'PRE' },
				style: { color: combineRgb(255, 255, 255), bgcolor: combineRgb(180, 80, 0) },
			},
			{
				feedbackId: FeedbackId.SendMode,
				options: { src, dest, mode: 'POST' },
				style: { color: combineRgb(255, 255, 255), bgcolor: combineRgb(0, 130, 0) },
			},
			{
				feedbackId: FeedbackId.SendMode,
				options: { src, dest, mode: 'GRP' },
				style: { color: combineRgb(255, 255, 255), bgcolor: combineRgb(0, 60, 180) },
			},
		],
	}
}

function getFxEffectParamKnobPreset(slot: number): WingPreset {
	const path = EffectCommands.Node(slot)
	return {
		name: `FX${slot} Effect Param Knob`,
		category: 'FX',
		type: 'simple',
		style: {
			text: `FX${slot}\nParam`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(60, 40, 100),
		},
		steps: [
			{
				down: [
					{
						actionId: FxActionId.SetEffectParam,
						options: { slot: path, effect: 'HALL', param_HALL: 'pdel', mode: 'set', value: 0, fadeDuration: 0 },
					},
				],
				up: [],
				rotate_left: [
					{
						actionId: FxActionId.SetEffectParam,
						options: { slot: path, effect: 'HALL', param_HALL: 'pdel', mode: 'sub', value: 1 },
					},
				],
				rotate_right: [
					{
						actionId: FxActionId.SetEffectParam,
						options: { slot: path, effect: 'HALL', param_HALL: 'pdel', mode: 'add', value: 1 },
					},
				],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.FxInsertOn,
				options: { slot: path },
				style: { color: combineRgb(255, 255, 255), bgcolor: combineRgb(60, 40, 100) },
			},
		],
	}
}

function getFxDelayParamKnobPreset(
	slot: number,
	param: string,
	label: string,
	step: number,
	resetValue: number,
): WingPreset {
	const path = EffectCommands.Node(slot)
	return {
		name: `FX${slot} Delay ${label} Knob`,
		category: 'FX',
		type: 'simple',
		style: {
			text: `FX${slot}\n${label}`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(100, 60, 0),
		},
		steps: [
			{
				down: [
					{ actionId: FxActionId.SetDelayParam, options: { slot: path, param, value: resetValue, fadeDuration: 0 } },
				],
				up: [],
				rotate_left: [{ actionId: FxActionId.AdjustDelayParam, options: { slot: path, param, step: -step } }],
				rotate_right: [{ actionId: FxActionId.AdjustDelayParam, options: { slot: path, param, step } }],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.FxInsertOn,
				options: { slot: path },
				style: { color: combineRgb(255, 255, 255), bgcolor: combineRgb(100, 60, 0) },
			},
		],
	}
}

function getSofPresets(base: string, val: number): WingPreset {
	const path = `/${base}/${val}`
	return {
		name: 'Sends on Fader',
		category: 'Sends on Fader',
		type: 'layered',
		elements: buildStripElements(base, val, 'SOF'),
		options: {
			stepAutoProgress: true,
		},
		steps: [
			{
				down: [
					{
						actionId: OtherActionId.SetSOF,
						options: {
							toggle: true,
							channel: path,
						},
					},
				],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.SofActive,
				options: {
					channel: path,
				},
				isInverted: false,
				styleOverrides: [colorOverride('box0', combineRgb(255, 165, 0))],
			},
		],
	}
}

////////////////////////////////////////////////////////////////
// Trim presets
////////////////////////////////////////////////////////////////

function getTrimResetPreset(base: string, num: number): WingPreset {
	const path = `/${base}/${num}`
	return {
		name: `${base.toUpperCase()}${num} Trim Reset`,
		category: 'Input Processing',
		type: 'simple',
		style: {
			text: `${base.toUpperCase()}${num}\nTrim\nReset`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(60, 40, 0),
		},
		steps: [{ down: [{ actionId: CommonActions.ResetTrim, options: { sel: path } }], up: [] }],
		feedbacks: [],
	}
}

////////////////////////////////////////////////////////////////
// Mute group presets
////////////////////////////////////////////////////////////////

function getMuteGroupTogglePreset(n: number): WingPreset {
	const path = `/mgrp/${n}`
	return {
		name: `Mute Group ${n} Toggle`,
		category: 'Mute Groups',
		type: 'simple',
		style: {
			text: `MG${n}`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0),
		},
		steps: [{ down: [{ actionId: CommonActions.SetMute, options: { sel: path, mute: -1 } }], up: [] }],
		feedbacks: [
			{
				feedbackId: FeedbackId.Mute,
				options: { sel: path, mute: 1 },
				style: { color: combineRgb(255, 255, 255), bgcolor: combineRgb(255, 0, 0) },
			},
		],
	}
}

function getMuteGroupMomentaryPreset(n: number): WingPreset {
	const path = `/mgrp/${n}`
	return {
		name: `Mute Group ${n} Momentary`,
		category: 'Mute Groups',
		type: 'simple',
		style: {
			text: `MG${n}\nHold`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(60, 0, 0),
		},
		steps: [
			{
				down: [{ actionId: CommonActions.SetMute, options: { sel: path, mute: 1 } }],
				up: [{ actionId: CommonActions.SetMute, options: { sel: path, mute: 0 } }],
			},
		],
		feedbacks: [],
	}
}

function getMuteGroupReleaseAllPreset(): WingPreset {
	return {
		name: 'Release All Mute Groups',
		category: 'Mute Groups',
		type: 'simple',
		style: {
			text: 'Release\nAll MG',
			size: 'auto',
			color: combineRgb(0, 0, 0),
			bgcolor: combineRgb(255, 200, 0),
		},
		steps: [{ down: [{ actionId: CommonActions.ReleaseAllMuteGroups, options: {} }], up: [] }],
		feedbacks: [],
	}
}

////////////////////////////////////////////////////////////////
// Fader presets
////////////////////////////////////////////////////////////////

function getFaderPreset(base: string, num: number, targetDb: number, label: string): WingPreset {
	const path = `/${base}/${num}`
	const BASE = base.toUpperCase()
	return {
		name: `${BASE}${num} Fader ${label}`,
		category: 'Fader',
		type: 'simple',
		style: {
			text: `${BASE}${num}\n${label}`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: targetDb === 0 ? combineRgb(0, 0, 100) : combineRgb(40, 40, 40),
		},
		steps: [
			{
				down: [
					{
						actionId: CommonActions.SetFader,
						options: { sel: path, level: targetDb, level_use_variables: false, fadeDuration: 0 },
					},
				],
				up: [],
			},
		],
		feedbacks: [],
	}
}

function getDcaMomentaryMutePreset(n: number): WingPreset {
	const path = `/dca/${n}`
	return {
		name: `DCA${n} Momentary Mute`,
		category: 'DCA',
		type: 'simple',
		style: {
			text: `DCA${n}\nHold`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(60, 0, 80),
		},
		steps: [
			{
				down: [{ actionId: CommonActions.SetMute, options: { sel: path, mute: 1 } }],
				up: [{ actionId: CommonActions.SetMute, options: { sel: path, mute: 0 } }],
			},
		],
		feedbacks: [],
	}
}

////////////////////////////////////////////////////////////////
// Phantom power preset
////////////////////////////////////////////////////////////////

function getPhantomPreset(base: string, num: number): WingPreset {
	const path = `/${base}/${num}`
	const name = `${base.toUpperCase()}${num}`
	return {
		name: `${name} Phantom Power`,
		category: 'Input Processing',
		type: 'simple',
		style: {
			text: `${name}\nΦ48V`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0),
		},
		steps: [{ down: [{ actionId: CommonActions.SetPhantomPower, options: { sel: path, phantom: -1 } }], up: [] }],
		feedbacks: [
			{
				feedbackId: FeedbackId.PhantomPower,
				options: { sel: path, sel_use_variables: false },
				style: { color: combineRgb(0, 0, 0), bgcolor: combineRgb(255, 140, 0) },
			},
		],
	}
}

////////////////////////////////////////////////////////////////
// Channel reset preset
////////////////////////////////////////////////////////////////

function getChannelResetPreset(base: string, num: number): WingPreset {
	const path = `/${base}/${num}`
	const name = `${base.toUpperCase()}${num}`
	return {
		name: `${name} Reset`,
		category: 'Channel Strip',
		type: 'simple',
		style: {
			text: `${name}\nReset`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(80, 0, 0),
		},
		steps: [{ down: [{ actionId: CommonActions.ResetChannel, options: { sel: path } }], up: [] }],
		feedbacks: [],
	}
}

function getBatchKillSendsPreset(base: string, num: number): WingPreset {
	const path = `/${base}/${num}`
	const name = `${base.toUpperCase()}${num}`
	return {
		name: `${name} Kill All Sends`,
		category: 'Channel Strip',
		type: 'simple',
		style: {
			text: `${name}\nKill\nSends`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(80, 40, 0),
		},
		steps: [{ down: [{ actionId: CommonActions.BatchKillSends, options: { sel: path } }], up: [] }],
		feedbacks: [],
	}
}

////////////////////////////////////////////////////////////////
// Talkback latch presets
////////////////////////////////////////////////////////////////

function getTalkbackLatchPreset(bus: 'A' | 'B'): WingPreset {
	return {
		name: `Talkback ${bus} Latch`,
		category: 'Talkback',
		type: 'simple',
		style: {
			text: `Talk ${bus}\nLatch`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0),
		},
		steps: [
			{
				down: [{ actionId: ConfigActions.TalkbackOn, options: { tb: bus, solo: -1 } }],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.Talkback,
				options: { tb: bus, on: '1' },
				style: { color: combineRgb(255, 255, 255), bgcolor: combineRgb(0, 0, 200) },
			},
		],
	}
}

////////////////////////////////////////////////////////////////
// AES50 status and solo-clear presets
////////////////////////////////////////////////////////////////

function getAes50StatusPreset(port: 'A' | 'B' | 'C'): WingPreset {
	return {
		name: `AES50 ${port} Status`,
		category: 'Console Status',
		type: 'simple',
		style: {
			text: `AES50 ${port}`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(30, 30, 30),
		},
		steps: [{ down: [], up: [] }],
		feedbacks: [
			{
				feedbackId: FeedbackId.AesStatus,
				options: { aes: port, aes_use_variables: false, status: 'OK', status_use_variables: false },
				style: { color: combineRgb(0, 0, 0), bgcolor: combineRgb(0, 200, 0) },
			},
			{
				feedbackId: FeedbackId.AesStatus,
				options: { aes: port, aes_use_variables: false, status: 'ERR', status_use_variables: false },
				style: { color: combineRgb(255, 255, 255), bgcolor: combineRgb(200, 0, 0) },
			},
		],
	}
}

function getSoloClearPreset(): WingPreset {
	return {
		name: 'Clear Solo',
		category: 'Console Status',
		type: 'simple',
		style: {
			text: 'Clear\nSolo',
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0),
		},
		steps: [{ down: [{ actionId: CommonActions.ClearSolo, options: {} }], up: [] }],
		feedbacks: [
			{
				feedbackId: FeedbackId.AnySoloActive,
				options: {},
				style: { bgcolor: combineRgb(255, 165, 0), color: combineRgb(0, 0, 0) },
			},
		],
	}
}

const SOLO_MON_ICON: Record<string, string> = {
	SPK: '🔊',
	PH: '🎧',
	'PH+SPK': '🔊\n🎧',
}

function getSoloMonitorPreset(out: 'SPK' | 'PH' | 'PH+SPK', label: string): WingPreset {
	return {
		name: `Solo Monitor - ${label}`,
		category: 'Monitor',
		type: 'simple',
		style: {
			text: SOLO_MON_ICON[out] ?? label,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(30, 30, 30),
		},
		steps: [
			{
				down: [{ actionId: ConfigActions.SetSoloMonitor, options: { out, out_use_variables: false } }],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.SoloMonitor,
				options: { out, out_use_variables: false },
				style: { bgcolor: combineRgb(0, 160, 220), color: combineRgb(0, 0, 0) },
			},
		],
	}
}

////////////////////////////////////////////////////////////////
// Scene presets
////////////////////////////////////////////////////////////////

function getSceneStepPreset(dir: 'PREV' | 'NEXT'): WingPreset {
	const label = dir === 'PREV' ? '◀ Prev' : 'Next ▶'
	return {
		name: `Scene ${dir === 'PREV' ? 'Previous' : 'Next'}`,
		category: 'Scene',
		type: 'simple',
		style: {
			text: label,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 60, 120),
		},
		steps: [
			{
				down: [
					{
						actionId: OtherActionId.SendLibraryAction,
						options: { act: `GO${dir}`, act_use_variables: false },
					},
				],
				up: [],
			},
		],
		feedbacks: [],
	}
}

function getSceneStatusPreset(): WingPreset {
	return {
		name: 'Scene Status',
		category: 'Scene',
		type: 'simple',
		style: {
			text: `Scene\n$(wing:active_scene_number)\n$(wing:active_scene_name)`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(30, 30, 60),
		},
		steps: [{ down: [], up: [] }],
		feedbacks: [],
	}
}

function getSceneDirectPreset(i: number): WingPreset {
	return {
		name: `Scene ${i} Direct Recall`,
		category: 'Scene',
		type: 'simple',
		style: {
			text: `Scene\n${i}`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0),
		},
		steps: [
			{
				down: [
					{
						actionId: OtherActionId.RecallSceneByNumber,
						options: { sceneId: i, sceneId_use_variables: false },
					},
				],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.ActiveScene,
				options: { scene: String(i) },
				style: { color: combineRgb(0, 0, 0), bgcolor: combineRgb(0, 220, 0) },
			},
		],
	}
}

////////////////////////////////////////////////////////////////
// DCA toggle mute preset
////////////////////////////////////////////////////////////////

function getDcaToggleMutePreset(n: number): WingPreset {
	const path = `/dca/${n}`
	return {
		name: `DCA${n} Mute Toggle`,
		category: 'DCA',
		type: 'simple',
		style: {
			text: `DCA${n}\nMute`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(60, 0, 80),
		},
		steps: [
			{
				down: [{ actionId: CommonActions.SetMute, options: { sel: path, mute: -1 } }],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.Mute,
				options: { sel: path, mute: 1 },
				style: { color: combineRgb(255, 255, 255), bgcolor: combineRgb(255, 0, 0) },
			},
		],
	}
}

////////////////////////////////////////////////////////////////
// Monitor engineer presets
////////////////////////////////////////////////////////////////

function getMonitorMasterPreset(bus: number): WingPreset {
	const path = `/bus/${bus}`
	return {
		name: `Monitor BUS${bus} Master`,
		category: 'Monitor',
		type: 'simple',
		style: {
			text: `BUS${bus}`,
			size: '14',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 30, 50),
		},
		steps: [
			{
				down: [{ actionId: CommonActions.SetMute, options: { sel: path, mute: -1 } }],
				up: [],
				rotate_left: [
					{
						actionId: CommonActions.DeltaFader,
						options: { sel: path, delta: -1, delta_use_variables: false, delta_use_percentage: false, fadeDuration: 0 },
					},
				],
				rotate_right: [
					{
						actionId: CommonActions.DeltaFader,
						options: { sel: path, delta: 1, delta_use_variables: false, delta_use_percentage: false, fadeDuration: 0 },
					},
				],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.FaderDisplay,
				options: { sel: path, sel_use_variables: false },
			},
			{
				feedbackId: FeedbackId.Mute,
				options: { sel: path, mute: 1 },
				style: { color: combineRgb(255, 100, 100), bgcolor: combineRgb(80, 0, 0) },
			},
		],
	}
}

function getMonitorSendPreset(ch: number, bus: number): WingPreset {
	const src = `/ch/${ch}`
	const dest = `/bus/${bus}`
	return {
		name: `Monitor CH${ch} → BUS${bus}`,
		category: 'Monitor',
		type: 'simple',
		style: {
			text: `CH${ch}\n→B${bus}`,
			size: 'auto',
			color: combineRgb(200, 220, 255),
			bgcolor: combineRgb(0, 25, 45),
		},
		steps: [
			{
				down: [
					{
						actionId: CommonActions.SetSendMute,
						options: { src, dest, src_use_variables: false, dest_use_variables: false, mute: -1 },
					},
				],
				up: [],
				rotate_left: [
					{
						actionId: CommonActions.DeltaSendFader,
						options: {
							src,
							dest,
							src_use_variables: false,
							dest_use_variables: false,
							delta: -1,
							delta_use_variables: false,
							delta_use_percentage: false,
						},
					},
				],
				rotate_right: [
					{
						actionId: CommonActions.DeltaSendFader,
						options: {
							src,
							dest,
							src_use_variables: false,
							dest_use_variables: false,
							delta: 1,
							delta_use_variables: false,
							delta_use_percentage: false,
						},
					},
				],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.SendMute,
				options: { src, dest, src_use_variables: false, dest_use_variables: false, on: '1' },
				style: { bgcolor: combineRgb(60, 0, 0), color: combineRgb(180, 80, 80) },
			},
		],
	}
}

////////////////////////////////////////////////////////////////
// Fader display preset (rotary knob with live level bar)
////////////////////////////////////////////////////////////////

function getFaderDisplayPreset(base: string, num: number): WingPreset {
	const path = `/${base}/${num}`
	const BASE = base.toUpperCase()
	return {
		name: `${BASE}${num} Fader Display`,
		category: 'Fader',
		type: 'simple',
		style: {
			text: `${BASE}${num}`,
			size: '14',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(10, 20, 40),
		},
		steps: [
			{
				down: [],
				up: [],
				rotate_left: [
					{
						actionId: CommonActions.DeltaFader,
						options: {
							sel: path,
							delta: -3,
							delta_use_variables: false,
							delta_use_percentage: false,
							fadeDuration: 0,
						},
					},
				],
				rotate_right: [
					{
						actionId: CommonActions.DeltaFader,
						options: {
							sel: path,
							delta: 3,
							delta_use_variables: false,
							delta_use_percentage: false,
							fadeDuration: 0,
						},
					},
				],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.FaderDisplay,
				options: { sel: path, sel_use_variables: false },
			},
		],
	}
}

////////////////////////////////////////////////////////////////
// Channel → Bus send level rotary preset
////////////////////////////////////////////////////////////////

function getSendLevelKnobPreset(ch: number, bus: number): WingPreset {
	const src = `/ch/${ch}`
	const dest = `/bus/${bus}`
	return {
		name: `CH${ch} → BUS${bus} Send`,
		category: 'Bus Sends',
		type: 'simple',
		style: {
			text: `CH${ch}\n→B${bus}\nSend`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 40, 60),
		},
		steps: [
			{
				down: [{ actionId: CommonActions.SetSendMute, options: { src, dest, mute: -1 } }],
				up: [],
				rotate_left: [
					{
						actionId: CommonActions.DeltaSendFader,
						options: {
							src,
							dest,
							delta: -1,
							delta_use_variables: false,
							delta_use_percentage: false,
							fadeDuration: 0,
						},
					},
				],
				rotate_right: [
					{
						actionId: CommonActions.DeltaSendFader,
						options: {
							src,
							dest,
							delta: 1,
							delta_use_variables: false,
							delta_use_percentage: false,
							fadeDuration: 0,
						},
					},
				],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.SendMute,
				options: { src, dest, src_use_variables: false, dest_use_variables: false, mute: 0 },
				style: { bgcolor: combineRgb(0, 40, 60) },
			},
			{
				feedbackId: FeedbackId.SendMute,
				options: { src, dest, src_use_variables: false, dest_use_variables: false, mute: 1 },
				style: { bgcolor: combineRgb(60, 0, 0) },
			},
		],
	}
}

// ─── Bus / Main Remaster presets ──────────────────────────────────────────────

const REMASTER_TYPE: Record<string, { prefix: string; label: string }> = {
	bus: { prefix: 'B', label: 'Bus' },
	main: { prefix: 'M', label: 'Main' },
	mtx: { prefix: 'MX', label: 'Matrix' },
}

function getRemasterPreset(type: 'bus' | 'main' | 'mtx', num: number, delta: number): WingPreset {
	const sign = delta >= 0 ? '+' : ''
	const { prefix, label } = REMASTER_TYPE[type]
	return {
		name: `${label} ${num} Remaster ${sign}${delta}dB`,
		category: 'Bus Remaster',
		type: 'simple',
		style: {
			text: `${prefix}${num}\\n${sign}${delta}dB`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: delta >= 0 ? combineRgb(0, 80, 40) : combineRgb(80, 40, 0),
		},
		steps: [
			{
				down: [
					{
						actionId: BusActions.BusMasterRemaster,
						options: {
							bus_use_variables: false,
							bus: `/${type}/${num}`,
							delta: String(delta),
							delta_use_variables: false,
						},
					},
				],
				up: [],
			},
		],
		feedbacks: [],
	}
}

function getRemasterSelectedPreset(delta: number): WingPreset {
	const sign = delta >= 0 ? '+' : ''
	return {
		name: `Selected Strip Remaster ${sign}${delta}dB`,
		category: 'Bus Remaster',
		type: 'simple',
		style: {
			text: `SEL\\n${sign}${delta}dB`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: delta >= 0 ? combineRgb(0, 80, 40) : combineRgb(80, 40, 0),
		},
		steps: [
			{
				down: [
					{
						actionId: BusActions.BusMasterRemaster,
						options: {
							bus_use_variables: true,
							bus_variables: '$(wing:sel_string)',
							delta: String(delta),
							delta_use_variables: false,
						},
					},
				],
				up: [],
			},
		],
		feedbacks: [],
	}
}

// ─── Talkback Switcher presets ────────────────────────────────────────────────

/** Live name variable for a talkback destination, e.g. "/bus/6" -> "$(wing:bus6_name)". */
// Expression text for a talkback destination button: prefix + live name, falling back to the
// strip label + number (e.g. "Bus 6") when the destination has no name. Used with textExpression.
function destLabelExpression(prefix: string, dest: string): string {
	const [, base, num] = dest.split('/')
	const nameVar = `$(wing:${base}${num}_name)`
	const fallback = `${STRIP_FALLBACK_LABEL[base] ?? base} ${num}`
	return `concat('${prefix}', ${nameOrFallbackExpr(nameVar, fallback)})`
}

function getTbSwExclusivePreset(tb: 'A' | 'B', dest: string, name: string, activeBg: number): WingPreset {
	return {
		name: `TB ${tb} → ${name}`,
		category: 'Talkback Switcher',
		type: 'simple',
		style: {
			text: destLabelExpression(`${tb}:`, dest),
			textExpression: true,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(30, 30, 30),
		},
		steps: [
			{
				down: [
					{
						actionId: TalkbackSwitcherActionId.ExclusiveDest,
						options: {
							tb,
							dests: [dest],
							open_mic: '0',
							tb_use_variables: false,
							open_mic_use_variables: false,
						},
					},
				],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.TalkbackAssign,
				options: {
					tb,
					tb_use_variables: false,
					dest,
					dest_use_variables: false,
					assign: '1',
					assign_use_variables: false,
				},
				style: { bgcolor: activeBg, color: combineRgb(255, 255, 255) },
			},
		],
	}
}

function getTbSwAdditivePreset(tb: 'A' | 'B', dest: string, name: string, activeBg: number): WingPreset {
	return {
		name: `TB ${tb} + ${name}`,
		category: 'Talkback Switcher',
		type: 'simple',
		style: {
			text: destLabelExpression(`${tb}+`, dest),
			textExpression: true,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(30, 30, 30),
		},
		steps: [
			{
				down: [
					{
						actionId: TalkbackSwitcherActionId.AdditiveDest,
						options: { tb, tb_use_variables: false, dest, dest_use_variables: false },
					},
				],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.TalkbackAssign,
				options: {
					tb,
					tb_use_variables: false,
					dest,
					dest_use_variables: false,
					assign: '1',
					assign_use_variables: false,
				},
				style: { bgcolor: activeBg, color: combineRgb(255, 255, 255) },
			},
		],
	}
}

function getTbSwAllCallPreset(tb: 'A' | 'B'): WingPreset {
	return {
		name: `TB ${tb} → ALL`,
		category: 'Talkback Switcher',
		type: 'simple',
		style: {
			text: `${tb}:ALL`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(30, 30, 30),
		},
		steps: [
			{
				down: [
					{
						actionId: TalkbackSwitcherActionId.AllCall,
						options: { tb, tb_use_variables: false },
					},
				],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.Talkback,
				options: { tb, on: '1', tb_use_variables: false, on_use_variables: false },
				style: { bgcolor: combineRgb(220, 220, 220), color: combineRgb(0, 0, 0) },
			},
		],
	}
}

function getTbSwBackPreset(tb: 'A' | 'B'): WingPreset {
	return {
		name: `TB ${tb} — Back`,
		category: 'Talkback Switcher',
		type: 'simple',
		style: {
			text: `${tb}:Back`,
			size: 'auto',
			color: combineRgb(200, 200, 200),
			bgcolor: combineRgb(60, 60, 60),
		},
		steps: [
			{
				down: [
					{
						actionId: TalkbackSwitcherActionId.Back,
						options: { tb, tb_use_variables: false },
					},
				],
				up: [],
			},
		],
		feedbacks: [],
	}
}

function getTbSwOffPreset(tb: 'A' | 'B'): WingPreset {
	return {
		name: `TB ${tb} — OFF`,
		category: 'Talkback Switcher',
		type: 'simple',
		style: {
			text: `${tb}:OFF`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(80, 0, 0),
		},
		steps: [
			{
				down: [
					{
						actionId: TalkbackSwitcherActionId.Off,
						options: { tb, tb_use_variables: false },
					},
				],
				up: [],
			},
		],
		feedbacks: [],
	}
}

function getTbSwPttPreset(tb: 'A' | 'B'): WingPreset {
	return {
		name: `TB ${tb} — PTT`,
		category: 'Talkback Switcher',
		type: 'simple',
		style: {
			text: `${tb}:PTT`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(30, 30, 30),
		},
		steps: [
			{
				down: [
					{
						actionId: ConfigActions.TalkbackOn,
						options: { tb, solo: 1, tb_use_variables: false, solo_use_variables: false },
					},
				],
				up: [
					{
						actionId: ConfigActions.TalkbackOn,
						options: { tb, solo: 0, tb_use_variables: false, solo_use_variables: false },
					},
				],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.Talkback,
				options: { tb, on: '1', tb_use_variables: false, on_use_variables: false },
				style: { bgcolor: combineRgb(255, 0, 0), color: combineRgb(255, 255, 255) },
			},
		],
	}
}

function getTbSwDualPttPreset(): WingPreset {
	return {
		name: 'TB A + B — PTT',
		category: 'Talkback Switcher',
		type: 'simple',
		style: {
			text: 'A+B PTT',
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(30, 30, 30),
		},
		steps: [
			{
				down: [
					{
						actionId: ConfigActions.TalkbackOn,
						options: { tb: 'A', solo: 1, tb_use_variables: false, solo_use_variables: false },
					},
					{
						actionId: ConfigActions.TalkbackOn,
						options: { tb: 'B', solo: 1, tb_use_variables: false, solo_use_variables: false },
					},
				],
				up: [
					{
						actionId: ConfigActions.TalkbackOn,
						options: { tb: 'A', solo: 0, tb_use_variables: false, solo_use_variables: false },
					},
					{
						actionId: ConfigActions.TalkbackOn,
						options: { tb: 'B', solo: 0, tb_use_variables: false, solo_use_variables: false },
					},
				],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.Talkback,
				options: { tb: 'A', on: '1', tb_use_variables: false, on_use_variables: false },
				style: { bgcolor: combineRgb(255, 0, 0), color: combineRgb(255, 255, 255) },
			},
		],
	}
}

function getTbSwDualAllCallPreset(): WingPreset {
	return {
		name: 'TB A + B — ALL',
		category: 'Talkback Switcher',
		type: 'simple',
		style: {
			text: 'A+B ALL',
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(30, 30, 30),
		},
		steps: [
			{
				down: [
					{
						actionId: TalkbackSwitcherActionId.AllCall,
						options: { tb: 'AB', tb_use_variables: false },
					},
				],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.Talkback,
				options: { tb: 'A', on: '1', tb_use_variables: false, on_use_variables: false },
				style: { bgcolor: combineRgb(220, 220, 220), color: combineRgb(0, 0, 0) },
			},
		],
	}
}

// ─── Gain compensation queue presets ─────────────────────────────────────────

function getGainQueueSlotPreset(slot: number): WingPreset {
	return {
		name: `Gain Queue ${slot}`,
		category: 'Gain Compensation',
		type: 'simple',
		style: {
			text: `#${slot}`,
			size: 'auto',
			color: combineRgb(200, 200, 200),
			bgcolor: combineRgb(20, 20, 20),
		},
		steps: [
			{
				down: [
					{
						actionId: CommonActions.CompensateQueueSlot,
						options: { slot: String(slot) },
					},
				],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: FeedbackId.GainQueueSlot,
				options: { slot: String(slot) },
			},
		],
	}
}
