import { combineRgb, CompanionPresetDefinitions, CompanionButtonPresetDefinition } from '@companion-module/base'
import { InstanceBaseExt } from './types.js'
import { WingConfig } from './config.js'
import { CommonActions } from './actions/common.js'
import { OtherActionId } from './actions/control.js'
import { FeedbackId } from './feedbacks.js'
import { ConfigActions } from './actions/config.js'
import { FxActionId } from './actions/fx.js'
import { EffectCommands } from './commands/effect.js'
import { CardsActionId } from './actions/cards.js'
import { UsbPlayerActionId } from './actions/usbplayer.js'

export function GetPresets(_instance: InstanceBaseExt<WingConfig>): CompanionPresetDefinitions {
	const model = _instance.model

	const presets: {
		[id: string]: CompanionButtonPresetDefinition | undefined
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
	}

	for (let i = 1; i <= model.busses; i++) {
		for (let ch = 1; ch <= Math.min(model.channels, 8); ch++) {
			presets[`ch${ch}-bus${i}-send-mode`] = getSendModePreset(ch, i)
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
	}

	for (let i = 1; i <= model.busses; i++) {
		presets[`bus${i}-mute-button`] = getMutePreset('bus', i)
		presets[`bus${i}-solo-button`] = getSoloPreset('bus', i)
		presets[`bus${i}-sof-button`] = getSofPresets('bus', i)
		presets[`bus${i}-nominal`] = getFaderPreset('bus', i, 0, 'Nominal')
		presets[`bus${i}-cut`] = getFaderPreset('bus', i, -144, 'Cut')
	}

	for (let i = 1; i <= model.matrices; i++) {
		presets[`mtx${i}-mute-button`] = getMutePreset('mtx', i)
		presets[`mtx${i}-solo-button`] = getSoloPreset('mtx', i)
		presets[`mtx${i}-sof-button`] = getSofPresets('mtx', i)
		presets[`mtx${i}-nominal`] = getFaderPreset('mtx', i, 0, 'Nominal')
		presets[`mtx${i}-cut`] = getFaderPreset('mtx', i, -144, 'Cut')
	}

	for (let i = 1; i <= model.mains; i++) {
		presets[`main${i}-mute-button`] = getMutePreset('main', i)
		presets[`main${i}-solo-button`] = getSoloPreset('main', i)
		presets[`main${i}-sof-button`] = getSofPresets('main', i)
		presets[`main${i}-nominal`] = getFaderPreset('main', i, 0, 'Nominal')
		presets[`main${i}-cut`] = getFaderPreset('main', i, -144, 'Cut')
	}

	for (let i = 1; i <= model.dcas; i++) {
		presets[`dca${i}-mute-button`] = getMutePreset('dca', i)
		presets[`dca${i}-solo-button`] = getSoloPreset('dca', i)
		presets[`dca${i}-nominal`] = getFaderPreset('dca', i, 0, 'Nominal')
		presets[`dca${i}-cut`] = getFaderPreset('dca', i, -144, 'Cut')
		presets[`dca${i}-momentary-mute`] = getDcaMomentaryMutePreset(i)
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

	presets['stat-aes50-a'] = getAes50StatusPreset('A')
	presets['stat-aes50-b'] = getAes50StatusPreset('B')
	presets['stat-aes50-c'] = getAes50StatusPreset('C')
	presets['stat-solo-clear'] = getSoloClearPreset()

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

	return presets
}

function getGlobalMainAltPreset(source: 0 | 1, label: string): CompanionButtonPresetDefinition {
	const isAlt = source === 1
	return {
		name: `Global Input: ${label}`,
		category: 'Input Switching',
		type: 'button',
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

function getGlobalMainAltTogglePreset(): CompanionButtonPresetDefinition {
	return {
		name: 'Global Input: Toggle',
		category: 'Input Switching',
		type: 'button',
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

function getChannelAltSourcePreset(base: string, num: number): CompanionButtonPresetDefinition {
	const path = `/${base}/${num}`
	const name = `${base.toUpperCase()}${num}`
	return {
		name: `${name} Alt Source Toggle`,
		category: 'Input Switching',
		type: 'button',
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

function getMutePreset(base: string, val: number): CompanionButtonPresetDefinition {
	const path = `/${base}/${val}`
	const name = `${base.toUpperCase()}${val}`
	return {
		name: 'Mute Button',
		category: 'Mute',
		type: 'button',
		style: {
			text: `let name = 'Mute'const realName = $(wing:${base}${val}_name)let hasNoName = realName === '' || return hasNoName ? 'Mute ${name}' : \`Mute \${realName}\``,
			textExpression: true,
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
				style: {
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(255, 0, 0),
				},
			},
		],
	}
}

function getSoloPreset(base: string, val: number): CompanionButtonPresetDefinition {
	const path = `/${base}/${val}`
	const name = `${base.toUpperCase()}${val}`
	return {
		name: `SoloButton`,
		category: 'Solo',
		type: 'button',
		style: {
			text: `let name = 'Solo'const realName = $(wing:${base}${val}_name)let hasNoName = realName === '' || return hasNoName ? 'Solo ${name}' : \`Solo \${realName}\``,
			textExpression: true,
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
				style: {
					color: combineRgb(0, 0, 0),
					bgcolor: combineRgb(255, 255, 0),
				},
			},
		],
	}
}

function getBoostAndCenterPreset(base: string, val: number): CompanionButtonPresetDefinition {
	const path = `/${base}/${val}`
	const name = `${base.toUpperCase()}${val}`
	return {
		name: 'Boost and Center Button',
		category: 'Boost',
		type: 'button',
		style: {
			text: `let name = 'Boost & Center'const realName = $(wing:${base}${val}_name)let hasNoName = realName === '' || return hasNoName ? 'Boost & Center ${name}' : \`Boost & Center \${realName}\``,
			textExpression: true,
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

function getTalkbackPreset(talkback: 'A' | 'B'): CompanionButtonPresetDefinition {
	return {
		name: `Talkback ${talkback}`,
		category: 'Talkback',
		type: 'button',
		style: {
			text: `TB ${talkback}`,
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
						actionId: ConfigActions.TalkbackOn,
						options: {
							tb: `${talkback}`,
							solo: 2,
						},
					},
				],
				up: [],
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

function getGainCompSnapshotPreset(): CompanionButtonPresetDefinition {
	return {
		name: 'Gain Comp - Snapshot',
		category: 'Gain Compensation',
		type: 'button',
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

function getGainCompTogglePreset(mode: 'auto' | 'manual'): CompanionButtonPresetDefinition {
	const label = mode === 'auto' ? 'COMP\nAUTO' : 'COMP\nMANUAL'
	const activeBg = mode === 'auto' ? combineRgb(0, 180, 0) : combineRgb(200, 120, 0)
	const activeFeedback = mode === 'auto' ? FeedbackId.GainCompActive : FeedbackId.GainCompManualActive
	return {
		name: `Gain Comp - ${mode === 'auto' ? 'Auto' : 'Manual'} Toggle`,
		category: 'Gain Compensation',
		type: 'button',
		style: {
			text: label,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(40, 40, 40),
		},
		options: { stepAutoProgress: true },
		steps: [
			{
				down: [{ actionId: CommonActions.EnableGainComp, options: { mode } }],
				up: [],
			},
			{
				down: [{ actionId: CommonActions.DisableGainComp, options: {} }],
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

function getGainCompChannelPreset(ch: number): CompanionButtonPresetDefinition {
	const path = `/ch/${ch}`
	return {
		name: `Gain Comp - CH${ch}`,
		category: 'Gain Compensation',
		type: 'button',
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

function getLightPresetBright(): CompanionButtonPresetDefinition {
	return {
		name: 'Lights: Bright',
		category: 'Lighting',
		type: 'button',
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
							chlcdctr: '',
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
): CompanionButtonPresetDefinition {
	return {
		name: `USB Player: ${label}`,
		category: 'USB Player',
		type: 'button',
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

function getUsbTrackDisplayPreset(): CompanionButtonPresetDefinition {
	return {
		name: 'USB Player: Track Display',
		category: 'USB Player',
		type: 'button',
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
): CompanionButtonPresetDefinition {
	return {
		name: `USB Recorder: ${label}`,
		category: 'USB Recorder',
		type: 'button',
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

function getUsbRecStatusPreset(): CompanionButtonPresetDefinition {
	return {
		name: 'USB Recorder: Status',
		category: 'USB Recorder',
		type: 'button',
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

function getHeadampGainPreset(ch: number): CompanionButtonPresetDefinition {
	const path = `/ch/${ch}`
	return {
		name: `CH${ch} Headamp Gain`,
		category: 'Input Processing',
		type: 'button',
		style: {
			text: `CH${ch}\n$(wing:ch${ch}_gain)dB`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(40, 20, 60),
		},
		options: { rotaryActions: true },
		steps: [
			{
				down: [],
				up: [],
				rotate_left: [{ actionId: CommonActions.AdjustHeadampGain, options: { channel: path, step: -3 } }],
				rotate_right: [{ actionId: CommonActions.AdjustHeadampGain, options: { channel: path, step: 3 } }],
			},
		],
		feedbacks: [],
	}
}

function getLightPresetDark(): CompanionButtonPresetDefinition {
	return {
		name: 'Lights: Dark',
		category: 'Lighting',
		type: 'button',
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
							chlcdctr: '',
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

function getFxBypassPreset(slot: number): CompanionButtonPresetDefinition {
	const path = EffectCommands.Node(slot)
	return {
		name: 'FX Bypass Toggle',
		category: 'FX',
		type: 'button',
		style: {
			text: `let m = $(wing:fx${slot}_model)\nreturn m && m !== 'NONE' ? \`FX${slot}\\n\${m}\` : \`FX ${slot}\``,
			textExpression: true,
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

function getFxMixKnobPreset(slot: number): CompanionButtonPresetDefinition {
	const path = EffectCommands.Node(slot)
	return {
		name: `FX${slot} Mix Knob`,
		category: 'FX',
		type: 'button',
		style: {
			text: `FX${slot}\nMix\n$(wing:fx${slot}_fxmix)%`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 60, 120),
		},
		options: { rotaryActions: true },
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

function getFxScrollPreset(slot: number, group: string): CompanionButtonPresetDefinition {
	const path = EffectCommands.Node(slot)
	const label = group.charAt(0).toUpperCase() + group.slice(1)
	return {
		name: `FX${slot} Scroll ${label}`,
		category: 'FX',
		type: 'button',
		style: {
			text: `FX${slot}\n$(wing:fx${slot}_model)\n◀ ${label} ▶`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(80, 0, 100),
		},
		options: { rotaryActions: true },
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
): CompanionButtonPresetDefinition {
	const path = EffectCommands.Node(slot)
	return {
		name: `FX${slot} Reverb ${label} Knob`,
		category: 'FX',
		type: 'button',
		style: {
			text: `FX${slot}\n${label}`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 80, 60),
		},
		options: { rotaryActions: true },
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

function getWLiveStatusPreset(card: number): CompanionButtonPresetDefinition {
	return {
		name: `WLive ${card} - Status`,
		category: 'WLive',
		type: 'button',
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

function getWLiveTransportPreset(card: number, action: string): CompanionButtonPresetDefinition {
	const label = WLIVE_TRANSPORT_LABEL[action] ?? action
	const activeColor = WLIVE_TRANSPORT_COLOR[action] ?? 0x404040
	return {
		name: `WLive ${card} - ${label}`,
		category: 'WLive',
		type: 'button',
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

function getWLiveAddMarkerPreset(card: number): CompanionButtonPresetDefinition {
	return {
		name: `WLive ${card} - Add Marker`,
		category: 'WLive',
		type: 'button',
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

function getWLiveGotoMarkerPreset(card: number, marker: number): CompanionButtonPresetDefinition {
	return {
		name: `WLive ${card} - Goto Marker ${marker}`,
		category: 'WLive',
		type: 'button',
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

function getWLiveSdFreePreset(card: number): CompanionButtonPresetDefinition {
	return {
		name: `WLive ${card} - SD Free`,
		category: 'WLive',
		type: 'button',
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

function getWLiveSessionInfoPreset(card: number): CompanionButtonPresetDefinition {
	return {
		name: `WLive ${card} - Session Info`,
		category: 'WLive',
		type: 'button',
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

function getWLiveOpenSessionPreset(card: number): CompanionButtonPresetDefinition {
	return {
		name: `WLive ${card} - Open Session`,
		category: 'WLive',
		type: 'button',
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

function getPhaseInvertPreset(base: string, num: number): CompanionButtonPresetDefinition {
	const path = `/${base}/${num}`
	const name = `${base.toUpperCase()}${num}`
	return {
		name: `${name} Phase Invert`,
		category: 'Monitor Tools',
		type: 'button',
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

function getWidthKnobPreset(base: string, num: number): CompanionButtonPresetDefinition {
	const path = `/${base}/${num}`
	const name = `${base.toUpperCase()}${num}`
	return {
		name: `${name} Width Knob`,
		category: 'Monitor Tools',
		type: 'button',
		style: {
			text: `${name}\nWidth`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 80, 100),
		},
		options: { rotaryActions: true },
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

function getSendModePreset(ch: number, bus: number): CompanionButtonPresetDefinition {
	const src = `/ch/${ch}`
	const dest = `/bus/${bus}`
	return {
		name: `CH${ch}→BUS${bus} Send Mode`,
		category: 'Monitor Tools',
		type: 'button',
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

function getFxEffectParamKnobPreset(slot: number): CompanionButtonPresetDefinition {
	const path = EffectCommands.Node(slot)
	return {
		name: `FX${slot} Effect Param Knob`,
		category: 'FX',
		type: 'button',
		style: {
			text: `FX${slot}\nParam`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(60, 40, 100),
		},
		options: { rotaryActions: true },
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
): CompanionButtonPresetDefinition {
	const path = EffectCommands.Node(slot)
	return {
		name: `FX${slot} Delay ${label} Knob`,
		category: 'FX',
		type: 'button',
		style: {
			text: `FX${slot}\n${label}`,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(100, 60, 0),
		},
		options: { rotaryActions: true },
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

function getSofPresets(base: string, val: number): CompanionButtonPresetDefinition {
	const path = `/${base}/${val}`
	const name = `${base.toUpperCase()}${val}`
	return {
		name: 'Sends on Fader',
		category: 'Sends on Fader',
		type: 'button',
		style: {
			text: `let name = 'SOF'const realName = $(wing:${base}${val}_name)let hasNoName = realName === '' || isreturn hasNoName ? 'SOF ${name}' : \`SOF \${realName}\``,
			textExpression: true,
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0),
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
				style: {
					bgcolor: combineRgb(255, 165, 0),
				},
			},
		],
	}
}

////////////////////////////////////////////////////////////////
// Trim presets
////////////////////////////////////////////////////////////////

function getTrimResetPreset(base: string, num: number): CompanionButtonPresetDefinition {
	const path = `/${base}/${num}`
	return {
		name: `${base.toUpperCase()}${num} Trim Reset`,
		category: 'Input Processing',
		type: 'button',
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

function getMuteGroupTogglePreset(n: number): CompanionButtonPresetDefinition {
	const path = `/mgrp/${n}`
	return {
		name: `Mute Group ${n} Toggle`,
		category: 'Mute Groups',
		type: 'button',
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

function getMuteGroupMomentaryPreset(n: number): CompanionButtonPresetDefinition {
	const path = `/mgrp/${n}`
	return {
		name: `Mute Group ${n} Momentary`,
		category: 'Mute Groups',
		type: 'button',
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

function getMuteGroupReleaseAllPreset(): CompanionButtonPresetDefinition {
	return {
		name: 'Release All Mute Groups',
		category: 'Mute Groups',
		type: 'button',
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

function getFaderPreset(base: string, num: number, targetDb: number, label: string): CompanionButtonPresetDefinition {
	const path = `/${base}/${num}`
	const BASE = base.toUpperCase()
	return {
		name: `${BASE}${num} Fader ${label}`,
		category: 'Fader',
		type: 'button',
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

function getDcaMomentaryMutePreset(n: number): CompanionButtonPresetDefinition {
	const path = `/dca/${n}`
	return {
		name: `DCA${n} Momentary Mute`,
		category: 'DCA',
		type: 'button',
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

function getPhantomPreset(base: string, num: number): CompanionButtonPresetDefinition {
	const path = `/${base}/${num}`
	const name = `${base.toUpperCase()}${num}`
	return {
		name: `${name} Phantom Power`,
		category: 'Input Processing',
		type: 'button',
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

function getChannelResetPreset(base: string, num: number): CompanionButtonPresetDefinition {
	const path = `/${base}/${num}`
	const name = `${base.toUpperCase()}${num}`
	return {
		name: `${name} Reset`,
		category: 'Channel Strip',
		type: 'button',
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

////////////////////////////////////////////////////////////////
// Talkback latch presets
////////////////////////////////////////////////////////////////

function getTalkbackLatchPreset(bus: 'A' | 'B'): CompanionButtonPresetDefinition {
	return {
		name: `Talkback ${bus} Latch`,
		category: 'Talkback',
		type: 'button',
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

function getAes50StatusPreset(port: 'A' | 'B' | 'C'): CompanionButtonPresetDefinition {
	return {
		name: `AES50 ${port} Status`,
		category: 'Console Status',
		type: 'button',
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

function getSoloClearPreset(): CompanionButtonPresetDefinition {
	return {
		name: 'Clear Solo',
		category: 'Console Status',
		type: 'button',
		style: {
			text: 'Clear\nSolo',
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0),
		},
		steps: [{ down: [{ actionId: CommonActions.ClearSolo, options: {} }], up: [] }],
		feedbacks: [],
	}
}

////////////////////////////////////////////////////////////////
// Scene presets
////////////////////////////////////////////////////////////////

function getSceneStepPreset(dir: 'PREV' | 'NEXT'): CompanionButtonPresetDefinition {
	const label = dir === 'PREV' ? '◀ Prev' : 'Next ▶'
	return {
		name: `Scene ${dir === 'PREV' ? 'Previous' : 'Next'}`,
		category: 'Scene',
		type: 'button',
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

function getSceneStatusPreset(): CompanionButtonPresetDefinition {
	return {
		name: 'Scene Status',
		category: 'Scene',
		type: 'button',
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

function getSceneDirectPreset(i: number): CompanionButtonPresetDefinition {
	return {
		name: `Scene ${i} Direct Recall`,
		category: 'Scene',
		type: 'button',
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
