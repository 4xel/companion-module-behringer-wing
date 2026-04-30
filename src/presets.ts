import { combineRgb, CompanionPresetDefinitions, CompanionButtonPresetDefinition } from '@companion-module/base'
import { InstanceBaseExt } from './types.js'
import { WingConfig } from './config.js'
import { CommonActions } from './actions/common.js'
import { OtherActionId } from './actions/control.js'
import { FeedbackId } from './feedbacks.js'
import { ConfigActions } from './actions/config.js'
import { FxActionId } from './actions/fx.js'
import { EffectCommands } from './commands/effect.js'

export function GetPresets(_instance: InstanceBaseExt<WingConfig>): CompanionPresetDefinitions {
	const model = _instance.model

	const presets: {
		[id: string]: CompanionButtonPresetDefinition | undefined
	} = {}

	for (let i = 1; i <= model.channels; i++) {
		presets[`ch${i}-mute-button`] = getMutePreset('ch', i)
		presets[`ch${i}-solo-button`] = getSoloPreset('ch', i)
		presets[`ch${i}-boost-and-center-button`] = getBoostAndCenterPreset('ch', i)
		presets[`ch${i}-sof-button`] = getSofPresets('ch', i)
	}

	for (let i = 1; i <= model.auxes; i++) {
		presets[`aux${i}-mute-button`] = getMutePreset('aux', i)
		presets[`aux${i}-solo-button`] = getSoloPreset('aux', i)
		presets[`aux${i}-boost-and-center-button`] = getBoostAndCenterPreset('aux', i)
		presets[`aux${i}-sof-button`] = getSofPresets('aux', i)
	}

	for (let i = 1; i <= model.busses; i++) {
		presets[`bus${i}-mute-button`] = getMutePreset('bus', i)
		presets[`bus${i}-solo-button`] = getSoloPreset('bus', i)
		presets[`bus${i}-sof-button`] = getSofPresets('bus', i)
	}

	for (let i = 1; i <= model.matrices; i++) {
		presets[`mtx${i}-mute-button`] = getMutePreset('mtx', i)
		presets[`mtx${i}-solo-button`] = getSoloPreset('mtx', i)
		presets[`mtx${i}-sof-button`] = getSofPresets('mtx', i)
	}

	for (let i = 1; i <= model.mains; i++) {
		presets[`main${i}-mute-button`] = getMutePreset('main', i)
		presets[`main${i}-solo-button`] = getSoloPreset('main', i)
		presets[`main${i}-sof-button`] = getSofPresets('main', i)
	}

	for (let i = 1; i <= model.dcas; i++) {
		presets[`dca${i}-mute-button`] = getMutePreset('dca', i)
		presets[`dca${i}-solo-button`] = getSoloPreset('dca', i)
	}

	presets[`talkback-a-button`] = getTalkbackPreset('A')
	presets[`talkback-b-button`] = getTalkbackPreset('B')

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

	presets[`lights-bright`] = getLightPresetBright()
	presets[`lights-dark`] = getLightPresetDark()

	return presets
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
