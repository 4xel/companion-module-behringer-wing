import { DropdownChoice } from '@companion-module/base'
import { CompanionActionWithCallback, WingActionDefinitions } from './common.js'
import { InstanceBaseExt } from '../types.js'
import { WingConfig } from '../config.js'
import {
	GetDropdownWithVariables,
	GetNumberFieldWithVariables,
	GetOnOffToggleDropdownWithVariables,
} from '../choices/common.js'
import { getStringWithVariables, getNumberWithVariables, getNodeNumberFromID } from './utils.js'
import { EffectCommands, resolveInsertOnPath } from '../commands/effect.js'
import { StateUtil } from '../state/index.js'
import { FadeDurationChoice } from '../choices/fades.js'
import { runTransition } from './utils.js'
import { ALL_FX_EFFECT_CHOICES, FX_EFFECT_PARAM_DEFS, getFxParamRange } from '../choices/fx-params.js'

// ─── Effect model lists ───────────────────────────────────────────────────────

const REVERB_MODELS: DropdownChoice[] = [
	{ id: 'HALL', label: 'Hall' },
	{ id: 'ROOM', label: 'Room' },
	{ id: 'CHAMBER', label: 'Chamber' },
	{ id: 'PLATE', label: 'Plate' },
	{ id: 'BPLATE', label: 'Bright Plate' },
	{ id: 'CONCERT', label: 'Concert' },
	{ id: 'AMBI', label: 'Ambience' },
	{ id: 'VSS3', label: 'VSS3' },
	{ id: 'V-ROOM', label: 'Vintage Room' },
	{ id: 'V-REV', label: 'Vintage Reverb' },
	{ id: 'V-PLATE', label: 'Vintage Plate' },
	{ id: 'GATED', label: 'Gated' },
	{ id: 'REVERSE', label: 'Reverse' },
	{ id: 'DEL/REV', label: 'Delay + Reverb' },
	{ id: 'SHIMMER', label: 'Shimmer' },
	{ id: 'SPRING', label: 'Spring' },
]

const DELAY_MODELS: DropdownChoice[] = [
	{ id: 'ST-DL', label: 'Stereo Delay' },
	{ id: 'TAP-DL', label: 'UltraTap Delay' },
	{ id: 'TAPE-DL', label: 'Tape Delay' },
	{ id: 'OILCAN', label: 'OilCan Delay' },
	{ id: 'BBD-DL', label: 'BBD Delay' },
]

const MODULATION_MODELS: DropdownChoice[] = [
	{ id: 'CHORUS', label: 'Stereo Chorus' },
	{ id: 'FLANGER', label: 'Stereo Flanger' },
	{ id: 'DIMCRS', label: 'Dimension CRS' },
	{ id: 'PHASER', label: 'Phaser' },
	{ id: 'PANNER', label: 'Tremolo Panner' },
	{ id: 'ROTARY', label: 'Rotary Speaker' },
]

const PITCH_MODELS: DropdownChoice[] = [
	{ id: 'PITCH', label: 'Stereo Pitch' },
	{ id: 'D-PITCH', label: 'Dual Pitch' },
]

const STANDARD_MODELS: DropdownChoice[] = [
	{ id: 'NONE', label: 'None' },
	{ id: 'EXT', label: 'External' },
	{ id: 'GEQ', label: 'Graphic EQ' },
	{ id: 'PIA', label: 'PIA 560 GEQ' },
	{ id: 'C5-CMB', label: 'C5 Combinator' },
	{ id: 'LIMITER', label: 'Precision Limiter' },
	{ id: 'DE-S2', label: '2-Band DeEsser' },
	{ id: 'ENHANCE', label: 'Ultra Enhancer' },
	{ id: 'EXCITER', label: 'Exciter' },
	{ id: 'P-BASS', label: 'Psycho Bass' },
	{ id: 'TAPE', label: 'Tape Machine' },
	{ id: 'MOOD', label: 'Mood Filter' },
	{ id: 'DOUBLE', label: 'Double Vocal' },
	{ id: 'SUB', label: 'Sub Octaver' },
	{ id: 'RACKAMP', label: 'Rack Amp' },
	{ id: 'UKROCK', label: 'UK Rock Amp' },
	{ id: 'ANGEL', label: 'Angel Amp' },
	{ id: 'JAZZC', label: 'Jazz Clean Amp' },
	{ id: 'DELUXE', label: 'Deluxe Amp' },
	{ id: 'SOUL', label: 'Soul Analogue' },
	{ id: 'E88', label: 'Even 88 Formant' },
	{ id: 'E84', label: 'Even 84' },
	{ id: 'F110', label: 'Fortissimo 110' },
	{ id: 'PULSAR', label: 'Pulsar' },
	{ id: 'MACH4', label: 'Mach EQ4' },
	{ id: 'PCORR', label: 'Pitch Correct' },
	{ id: 'SUB-M', label: 'Sub-M' },
	{ id: 'DEQ3', label: 'Dynamic EQ' },
	{ id: '*EVEN*', label: 'Plug: Even' },
	{ id: '*SOUL*', label: 'Plug: Soul' },
	{ id: '*VINTAGE*', label: 'Plug: Vintage' },
	{ id: '*BUS*', label: 'Plug: Bus' },
	{ id: '*MASTER*', label: 'Plug: Master' },
]

function getFxModelList(group: string): DropdownChoice[] {
	switch (group) {
		case 'reverb':
			return REVERB_MODELS
		case 'delay':
			return DELAY_MODELS
		case 'modulation':
			return MODULATION_MODELS
		case 'pitch':
			return PITCH_MODELS
		case 'standard':
			return STANDARD_MODELS
		default:
			return [...REVERB_MODELS, ...DELAY_MODELS, ...MODULATION_MODELS, ...PITCH_MODELS, ...STANDARD_MODELS]
	}
}

// ─── Parameter definitions ────────────────────────────────────────────────────

const REVERB_PARAM_CHOICES: DropdownChoice[] = [
	{ id: 'pdel', label: 'Pre-Delay (ms, 0–250)' },
	{ id: 'dcy', label: 'Decay Time (s, 0.1–25)' },
	{ id: 'size', label: 'Size (0–250)' },
	{ id: 'mult', label: 'Bass Multiplier (0.25–4)' },
	{ id: 'damp', label: 'Damping (Hz, 1000–20000)' },
	{ id: 'Lc', label: 'Low Cut (Hz, 20–400)' },
	{ id: 'hc', label: 'High Cut (Hz, 200–20000)' },
	{ id: 'diff', label: 'Diffusion (0–100)' },
	{ id: 'sprd', label: 'Spread (0–100)' },
	{ id: 'mspd', label: 'Mod Speed (0–100)' },
]

const REVERB_PARAM_RANGES: Record<string, { min: number; max: number }> = {
	pdel: { min: 0, max: 250 },
	dcy: { min: 0.1, max: 25 },
	size: { min: 0, max: 250 },
	mult: { min: 0.25, max: 4 },
	damp: { min: 1000, max: 20000 },
	Lc: { min: 20, max: 400 },
	hc: { min: 200, max: 20000 },
	diff: { min: 0, max: 100 },
	sprd: { min: 0, max: 100 },
	mspd: { min: 0, max: 100 },
}

const DELAY_PARAM_CHOICES: DropdownChoice[] = [
	{ id: 'time', label: 'Time (ms, 1–3000)' },
	{ id: 'feed', label: 'Feedback (%, 0–100)' },
	{ id: 'fhc', label: 'Feed High Cut (Hz, 200–20000)' },
	{ id: 'Lc', label: 'Low Cut (Hz, 20–400)' },
	{ id: 'hc', label: 'High Cut (Hz, 200–20000)' },
	{ id: 'pdel', label: 'Pre-Delay (ms, 0–500, TAP-DL)' },
	{ id: 'wid', label: 'Width (%, -100–100, TAP-DL)' },
]

const DELAY_PARAM_RANGES: Record<string, { min: number; max: number }> = {
	time: { min: 1, max: 3000 },
	feed: { min: 0, max: 100 },
	fhc: { min: 200, max: 20000 },
	Lc: { min: 20, max: 400 },
	hc: { min: 200, max: 20000 },
	pdel: { min: 0, max: 500 },
	wid: { min: -100, max: 100 },
}

const PITCHMOD_PARAM_CHOICES: DropdownChoice[] = [
	{ id: 'semi', label: 'Semitones (-12–12, PITCH/D-PITCH)' },
	{ id: 'cent', label: 'Cents (-50–50, PITCH/D-PITCH)' },
	{ id: 'spd', label: 'Speed (Hz, 0.05–5, CHORUS/FLANGER/PHASER/PANNER)' },
	{ id: 'depth', label: 'Depth (%, 0–100, CHORUS/FLANGER/PHASER)' },
	{ id: 'mix', label: 'Mix (%, 0–100, CHORUS/FLANGER/PHASER/ROTARY/PITCH)' },
	{ id: 'phase', label: 'Phase (°, 0–180, CHORUS/FLANGER/PHASER)' },
	{ id: 'dly', label: 'Delay (ms, 0–500, PITCH/D-PITCH)' },
	{ id: 'feed', label: 'Feedback (%, -90–90, FLANGER)' },
]

const PITCHMOD_PARAM_RANGES: Record<string, { min: number; max: number }> = {
	semi: { min: -12, max: 12 },
	cent: { min: -50, max: 50 },
	spd: { min: 0.05, max: 5 },
	depth: { min: 0, max: 100 },
	mix: { min: 0, max: 100 },
	phase: { min: 0, max: 180 },
	dly: { min: 0, max: 500 },
	feed: { min: -90, max: 90 },
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value))
}

// ─── Action IDs ───────────────────────────────────────────────────────────────

export enum FxActionId {
	SetFxMix = 'fx-set-fxmix',
	AdjustFxMix = 'fx-adjust-fxmix',
	StoreFxMix = 'fx-store-fxmix',
	RestoreFxMix = 'fx-restore-fxmix',
	SetFxInsertOn = 'fx-set-insert-on',
	LoadEffect = 'fx-load-effect',
	ScrollEffect = 'fx-scroll-effect',
	SetReverbParam = 'fx-set-reverb-param',
	AdjustReverbParam = 'fx-adjust-reverb-param',
	SetDelayParam = 'fx-set-delay-param',
	AdjustDelayParam = 'fx-adjust-delay-param',
	SetPitchModParam = 'fx-set-pitchmod-param',
	AdjustPitchModParam = 'fx-adjust-pitchmod-param',
	SetEffectParam = 'fx-set-effect-param',
	AdjustEffectParam = 'fx-adjust-effect-param',
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createFxActions(self: InstanceBaseExt<WingConfig>): WingActionDefinitions {
	const send = self.connection!.sendCommand.bind(self.connection)
	const ensureLoaded = (path: string, arg?: string | number): void => {
		self.connection?.sendCommand(path, arg).catch(() => {})
	}
	const state = self.stateHandler?.state
	const transitions = self.transitions
	if (!state) return {}

	const actions: { [id in FxActionId]: CompanionActionWithCallback | undefined } = {
		// ── Mix ──────────────────────────────────────────────────────────────

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
				self.connection?.sendCommand(EffectCommands.FxMix(slotNum)).catch(() => {})
			},
		},

		[FxActionId.AdjustFxMix]: {
			name: 'FX Slot - Adjust Mix (Relative)',
			description: 'Nudge the wet/dry mix up or down. Use with encoder knobs on StreamDeck+.',
			options: [
				...GetDropdownWithVariables('FX Slot', 'slot', state.namedChoices.effects),
				...GetNumberFieldWithVariables('Step (%)', 'step', -100, 100, 1, 5, 'Positive = increase, negative = decrease'),
			],
			callback: async (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const step = getNumberWithVariables(event, 'step')
				const cmd = EffectCommands.FxMix(slotNum)
				const current = StateUtil.getNumberFromState(cmd, state) ?? 0
				const newVal = clamp(current + step, 0, 100)
				await send(cmd, newVal)
				state.set(cmd, [{ type: 'f', value: newVal }])
			},
			subscribe: (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				ensureLoaded(EffectCommands.FxMix(slotNum))
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

		// ── Insert on/off ─────────────────────────────────────────────────────

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

		// ── Load / scroll effect model ────────────────────────────────────────

		[FxActionId.LoadEffect]: {
			name: 'FX Slot - Load Effect',
			description:
				'Load an effect model into an FX slot. Premium effects (reverb, delay, modulation, pitch) require slots 1–8.',
			options: [
				...GetDropdownWithVariables('FX Slot', 'slot', state.namedChoices.effects),
				{
					type: 'dropdown',
					label: 'Effect Category',
					id: 'category',
					default: 'reverb',
					choices: [
						{ id: 'reverb', label: 'Reverb (premium, slots 1–8)' },
						{ id: 'delay', label: 'Delay (premium, slots 1–8)' },
						{ id: 'modulation', label: 'Modulation (premium, slots 1–8)' },
						{ id: 'pitch', label: 'Pitch Shifter (premium, slots 1–8)' },
						{ id: 'standard', label: 'Standard (all slots)' },
					],
				},
				{
					type: 'dropdown',
					label: 'Reverb Model',
					id: 'model_reverb',
					default: 'HALL',
					choices: REVERB_MODELS,
					isVisibleExpression: `$(options:category) == 'reverb'`,
				},
				{
					type: 'dropdown',
					label: 'Delay Model',
					id: 'model_delay',
					default: 'ST-DL',
					choices: DELAY_MODELS,
					isVisibleExpression: `$(options:category) == 'delay'`,
				},
				{
					type: 'dropdown',
					label: 'Modulation Model',
					id: 'model_modulation',
					default: 'CHORUS',
					choices: MODULATION_MODELS,
					isVisibleExpression: `$(options:category) == 'modulation'`,
				},
				{
					type: 'dropdown',
					label: 'Pitch Model',
					id: 'model_pitch',
					default: 'PITCH',
					choices: PITCH_MODELS,
					isVisibleExpression: `$(options:category) == 'pitch'`,
				},
				{
					type: 'dropdown',
					label: 'Standard Model',
					id: 'model_standard',
					default: 'NONE',
					choices: STANDARD_MODELS,
					isVisibleExpression: `$(options:category) == 'standard'`,
				},
			],
			callback: async (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const category = event.options.category as string
				const model = event.options[`model_${category}`] as string
				if (!model) return
				await send(EffectCommands.Model(slotNum), model)
				state.set(EffectCommands.Model(slotNum), [{ type: 's', value: model }])
			},
		},

		[FxActionId.ScrollEffect]: {
			name: 'FX Slot - Scroll Effect (Relative)',
			description:
				'Step to the next or previous effect model within a group. Designed for encoder knobs on StreamDeck+.',
			options: [
				...GetDropdownWithVariables('FX Slot', 'slot', state.namedChoices.effects),
				{
					type: 'dropdown',
					label: 'Direction',
					id: 'direction',
					default: 'next',
					choices: [
						{ id: 'next', label: 'Next' },
						{ id: 'prev', label: 'Previous' },
					],
				},
				{
					type: 'dropdown',
					label: 'Limit to Group',
					id: 'group',
					default: 'reverb',
					choices: [
						{ id: 'all', label: 'All effects' },
						{ id: 'reverb', label: 'Reverb only' },
						{ id: 'delay', label: 'Delay only' },
						{ id: 'modulation', label: 'Modulation only' },
						{ id: 'pitch', label: 'Pitch Shifter only' },
						{ id: 'standard', label: 'Standard only' },
					],
				},
				{
					type: 'checkbox',
					label: 'Wrap around at end of list',
					id: 'wrap',
					default: true,
				},
			],
			callback: async (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const direction = event.options.direction as string
				const group = event.options.group as string
				const wrap = event.options.wrap as boolean

				const currentModel = StateUtil.getStringFromState(EffectCommands.Model(slotNum), state) ?? 'NONE'
				const models = getFxModelList(group).map((m) => m.id as string)

				let idx = models.indexOf(currentModel)
				if (idx === -1) {
					idx = direction === 'next' ? 0 : models.length - 1
				} else {
					idx += direction === 'next' ? 1 : -1
					if (wrap) {
						idx = ((idx % models.length) + models.length) % models.length
					} else {
						idx = clamp(idx, 0, models.length - 1)
					}
				}

				const newModel = models[idx]
				await send(EffectCommands.Model(slotNum), newModel)
				state.set(EffectCommands.Model(slotNum), [{ type: 's', value: newModel }])
			},
			subscribe: (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				ensureLoaded(EffectCommands.Model(slotNum))
			},
		},

		// ── Reverb parameters ─────────────────────────────────────────────────

		[FxActionId.SetReverbParam]: {
			name: 'FX Slot - Set Reverb Parameter',
			description:
				'Set a reverb parameter (pre-delay, decay, size, etc.). Works with HALL, ROOM, CHAMBER, PLATE, CONCERT, AMBI, VSS3, V-ROOM, V-REV, V-PLATE, GATED, REVERSE, SHIMMER.',
			options: [
				...GetDropdownWithVariables('FX Slot', 'slot', state.namedChoices.effects),
				{
					type: 'dropdown',
					label: 'Parameter',
					id: 'param',
					default: 'pdel',
					choices: REVERB_PARAM_CHOICES,
				},
				...GetNumberFieldWithVariables(
					'Value',
					'value',
					-20000,
					20000,
					0.01,
					0,
					'Range depends on parameter — see label for reference',
				),
				...FadeDurationChoice(),
			],
			callback: async (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const param = event.options.param as string
				const value = getNumberWithVariables(event, 'value')
				const range = REVERB_PARAM_RANGES[param]
				if (!range) return
				const cmd = EffectCommands.Param(slotNum, param)
				const clamped = clamp(value, range.min, range.max)
				runTransition(cmd, 'value', event, state, transitions, clamped, false)
			},
			subscribe: (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const param = event.options.param as string
				if (param) ensureLoaded(EffectCommands.Param(slotNum, param))
			},
		},

		[FxActionId.AdjustReverbParam]: {
			name: 'FX Slot - Adjust Reverb Parameter (Relative)',
			description: 'Nudge a reverb parameter up or down. Use with encoder knobs on StreamDeck+.',
			options: [
				...GetDropdownWithVariables('FX Slot', 'slot', state.namedChoices.effects),
				{
					type: 'dropdown',
					label: 'Parameter',
					id: 'param',
					default: 'pdel',
					choices: REVERB_PARAM_CHOICES,
				},
				...GetNumberFieldWithVariables(
					'Step',
					'step',
					-20000,
					20000,
					0.01,
					1,
					'Positive = increase, negative = decrease',
				),
			],
			callback: async (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const param = event.options.param as string
				const step = getNumberWithVariables(event, 'step')
				const range = REVERB_PARAM_RANGES[param]
				if (!range) return
				const cmd = EffectCommands.Param(slotNum, param)
				const current = StateUtil.getNumberFromState(cmd, state) ?? range.min
				const newVal = clamp(current + step, range.min, range.max)
				await send(cmd, newVal)
				state.set(cmd, [{ type: 'f', value: newVal }])
			},
			subscribe: (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const param = event.options.param as string
				if (param) ensureLoaded(EffectCommands.Param(slotNum, param))
			},
		},

		// ── Delay parameters ──────────────────────────────────────────────────

		[FxActionId.SetDelayParam]: {
			name: 'FX Slot - Set Delay Parameter',
			description:
				'Set a delay parameter (time, feedback, etc.). Works with ST-DL, TAP-DL, TAPE-DL, OILCAN, BBD-DL, DEL/REV.',
			options: [
				...GetDropdownWithVariables('FX Slot', 'slot', state.namedChoices.effects),
				{
					type: 'dropdown',
					label: 'Parameter',
					id: 'param',
					default: 'time',
					choices: DELAY_PARAM_CHOICES,
				},
				...GetNumberFieldWithVariables(
					'Value',
					'value',
					-20000,
					20000,
					0.01,
					0,
					'Range depends on parameter — see label for reference',
				),
				...FadeDurationChoice(),
			],
			callback: async (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const param = event.options.param as string
				const value = getNumberWithVariables(event, 'value')
				const range = DELAY_PARAM_RANGES[param]
				if (!range) return
				const cmd = EffectCommands.Param(slotNum, param)
				const clamped = clamp(value, range.min, range.max)
				runTransition(cmd, 'value', event, state, transitions, clamped, false)
			},
			subscribe: (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const param = event.options.param as string
				if (param) ensureLoaded(EffectCommands.Param(slotNum, param))
			},
		},

		[FxActionId.AdjustDelayParam]: {
			name: 'FX Slot - Adjust Delay Parameter (Relative)',
			description: 'Nudge a delay parameter up or down. Use with encoder knobs on StreamDeck+.',
			options: [
				...GetDropdownWithVariables('FX Slot', 'slot', state.namedChoices.effects),
				{
					type: 'dropdown',
					label: 'Parameter',
					id: 'param',
					default: 'time',
					choices: DELAY_PARAM_CHOICES,
				},
				...GetNumberFieldWithVariables(
					'Step',
					'step',
					-20000,
					20000,
					0.01,
					10,
					'Positive = increase, negative = decrease',
				),
			],
			callback: async (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const param = event.options.param as string
				const step = getNumberWithVariables(event, 'step')
				const range = DELAY_PARAM_RANGES[param]
				if (!range) return
				const cmd = EffectCommands.Param(slotNum, param)
				const current = StateUtil.getNumberFromState(cmd, state) ?? range.min
				const newVal = clamp(current + step, range.min, range.max)
				await send(cmd, newVal)
				state.set(cmd, [{ type: 'f', value: newVal }])
			},
			subscribe: (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const param = event.options.param as string
				if (param) ensureLoaded(EffectCommands.Param(slotNum, param))
			},
		},

		// ── Pitch / Modulation parameters ─────────────────────────────────────

		[FxActionId.SetPitchModParam]: {
			name: 'FX Slot - Set Pitch / Modulation Parameter',
			description:
				'Set a pitch or modulation parameter (semitones, speed, depth, etc.). Works with PITCH, D-PITCH, CHORUS, FLANGER, PHASER, PANNER, ROTARY.',
			options: [
				...GetDropdownWithVariables('FX Slot', 'slot', state.namedChoices.effects),
				{
					type: 'dropdown',
					label: 'Parameter',
					id: 'param',
					default: 'semi',
					choices: PITCHMOD_PARAM_CHOICES,
				},
				...GetNumberFieldWithVariables(
					'Value',
					'value',
					-90,
					500,
					0.01,
					0,
					'Range depends on parameter — see label for reference',
				),
				...FadeDurationChoice(),
			],
			callback: async (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const param = event.options.param as string
				const value = getNumberWithVariables(event, 'value')
				const range = PITCHMOD_PARAM_RANGES[param]
				if (!range) return
				const cmd = EffectCommands.Param(slotNum, param)
				const clamped = clamp(value, range.min, range.max)
				runTransition(cmd, 'value', event, state, transitions, clamped, false)
			},
			subscribe: (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const param = event.options.param as string
				if (param) ensureLoaded(EffectCommands.Param(slotNum, param))
			},
		},

		[FxActionId.AdjustPitchModParam]: {
			name: 'FX Slot - Adjust Pitch / Modulation Parameter (Relative)',
			description: 'Nudge a pitch or modulation parameter up or down. Use with encoder knobs on StreamDeck+.',
			options: [
				...GetDropdownWithVariables('FX Slot', 'slot', state.namedChoices.effects),
				{
					type: 'dropdown',
					label: 'Parameter',
					id: 'param',
					default: 'semi',
					choices: PITCHMOD_PARAM_CHOICES,
				},
				...GetNumberFieldWithVariables('Step', 'step', -500, 500, 0.01, 1, 'Positive = increase, negative = decrease'),
			],
			callback: async (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const param = event.options.param as string
				const step = getNumberWithVariables(event, 'step')
				const range = PITCHMOD_PARAM_RANGES[param]
				if (!range) return
				const cmd = EffectCommands.Param(slotNum, param)
				const current = StateUtil.getNumberFromState(cmd, state) ?? range.min
				const newVal = clamp(current + step, range.min, range.max)
				await send(cmd, newVal)
				state.set(cmd, [{ type: 'f', value: newVal }])
			},
			subscribe: (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const param = event.options.param as string
				if (param) ensureLoaded(EffectCommands.Param(slotNum, param))
			},
		},

		// ── Per-effect full param control ─────────────────────────────────────

		[FxActionId.SetEffectParam]: {
			name: 'FX Slot - Set Effect Parameter',
			description:
				'Select an effect, choose a parameter, and set it absolutely or adjust it up/down. The same action works for buttons (set) and encoder knobs (+/-).',
			options: [
				...GetDropdownWithVariables('FX Slot', 'slot', state.namedChoices.effects),
				{
					type: 'dropdown',
					label: 'Effect Type',
					id: 'effect',
					default: 'HALL',
					choices: ALL_FX_EFFECT_CHOICES,
				},
				// One param dropdown per effect, shown only when that effect is selected
				...Object.entries(FX_EFFECT_PARAM_DEFS)
					.filter(([, params]) => params.length > 0)
					.map(([effect, params]) => ({
						type: 'dropdown' as const,
						label: 'Parameter',
						id: `param_${effect}`,
						default: params[0].id,
						choices: params.map((p) => ({ id: p.id, label: p.label })),
						isVisibleExpression: `$(options:effect) == '${effect}'`,
					})),
				{
					type: 'dropdown',
					label: 'Mode',
					id: 'mode',
					default: 'set',
					choices: [
						{ id: 'set', label: 'Set (absolute value)' },
						{ id: 'add', label: '+ (add to current value)' },
						{ id: 'sub', label: '- (subtract from current value)' },
					],
				},
				...GetNumberFieldWithVariables(
					'Value / Step',
					'value',
					-20000,
					20000,
					0.01,
					0,
					'Allowed range shown in the parameter label above. For +/- modes this is the step size.',
				),
				...FadeDurationChoice(),
			],
			callback: async (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const effect = event.options.effect as string
				const param = event.options[`param_${effect}`] as string
				const mode = event.options.mode as string
				const value = getNumberWithVariables(event, 'value')
				const range = getFxParamRange(effect, param)
				if (!param || !range) return
				const cmd = EffectCommands.Param(slotNum, param)
				if (mode === 'set') {
					runTransition(cmd, 'value', event, state, transitions, clamp(value, range.min, range.max), false)
				} else {
					const current = StateUtil.getNumberFromState(cmd, state) ?? range.min
					const delta = mode === 'add' ? value : -value
					const newVal = clamp(current + delta, range.min, range.max)
					await send(cmd, newVal)
					state.set(cmd, [{ type: 'f', value: newVal }])
				}
			},
			subscribe: (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const effect = event.options.effect as string
				const param = event.options[`param_${effect}`] as string
				if (param) ensureLoaded(EffectCommands.Param(slotNum, param))
			},
		},

		[FxActionId.AdjustEffectParam]: {
			name: 'FX Slot - Adjust Effect Parameter (Relative)',
			description:
				'Select an effect type, then choose a parameter and nudge its value up or down. Designed for encoder knobs on StreamDeck+.',
			options: [
				...GetDropdownWithVariables('FX Slot', 'slot', state.namedChoices.effects),
				{
					type: 'dropdown',
					label: 'Effect Type',
					id: 'effect',
					default: 'HALL',
					choices: ALL_FX_EFFECT_CHOICES,
				},
				...Object.entries(FX_EFFECT_PARAM_DEFS)
					.filter(([, params]) => params.length > 0)
					.map(([effect, params]) => ({
						type: 'dropdown' as const,
						label: 'Parameter',
						id: `param_${effect}`,
						default: params[0].id,
						choices: params.map((p) => ({ id: p.id, label: p.label })),
						isVisibleExpression: `$(options:effect) == '${effect}'`,
					})),
				...GetNumberFieldWithVariables(
					'Step',
					'step',
					-20000,
					20000,
					0.01,
					1,
					'Positive = increase, negative = decrease',
				),
			],
			callback: async (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const effect = event.options.effect as string
				const param = event.options[`param_${effect}`] as string
				const step = getNumberWithVariables(event, 'step')
				const range = getFxParamRange(effect, param)
				if (!param || !range) return
				const cmd = EffectCommands.Param(slotNum, param)
				const current = StateUtil.getNumberFromState(cmd, state) ?? range.min
				const newVal = clamp(current + step, range.min, range.max)
				await send(cmd, newVal)
				state.set(cmd, [{ type: 'f', value: newVal }])
			},
			subscribe: (event) => {
				const slot = getStringWithVariables(event, 'slot')
				const slotNum = getNodeNumberFromID(slot)
				const effect = event.options.effect as string
				const param = event.options[`param_${effect}`] as string
				if (param) ensureLoaded(EffectCommands.Param(slotNum, param))
			},
		},
	}

	return actions
}
