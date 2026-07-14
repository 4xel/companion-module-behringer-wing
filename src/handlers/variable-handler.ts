import EventEmitter from 'events'
import { ModelSpec } from '../models/types.js'
import osc, { OscMessage } from 'osc'
import { CompanionVariableDefinitions, CompanionVariableValues, OSCMetaArgument } from '@companion-module/base'
import * as ActionUtil from '../actions/utils.js'
import { IoCommands } from '../commands/io.js'
import debounceFn from 'debounce-fn'
import { ModuleLogger } from '../handlers/logger.js'
import { getAllVariables } from '../variables/index.js'

const RE_NAME = /\/(\w+)\/(\d+)\/\$?name/
const RE_FX = /^\/fx\/(\d+)\/(mdL|fxmix)$/
const RE_GAIN = /\/(\w+)\/(\d+)\/in\/set\/\$g/
const RE_MUTE = /^\/(ch|aux|bus|mtx|main|dca|mgrp)\/(\d+)(?:\/(send|main)\/(?:(MX)(\d+)|(\d+))\/(mute|on)|\/(mute))$/
const RE_FADER = /^\/(\w+)\/(\w+)(?:\/(\w+)\/(\w+))?\/(fdr|lvl|\$fdr|\$lvl)$/
const RE_PAN = /^\/(\w+)\/(\w+)(?:\/(\w+)\/(\w+))?\/(pan|\$pan)$/
const RE_USB = /^\/(rec|play)\/(\$?\w+)$/
const RE_SD = /^\/cards\/wlive\/(\d)\/(\$?\w+)\/(\$?\w+)$/
const RE_TALKBACK = /^\/cfg\/talk\/(A|B)\/(B|MX|M)(\d+)$/
const RE_GPIO = /^\/\$ctl\/gpio\/(\d+)\/\$state$/
const RE_CONTROL = /^\/\$ctl\/(lib|\$stat)\/(\$?\w+)/
const RE_COLOR = /\/(\w+)\/(\d+)\/\$?col/
const RE_STRIP_WID = /^\/(ch|aux|bus|mtx|main)\/(\d+)\/wid$/
const RE_STRIP_TRIM = /^\/(ch|aux)\/(\d+)\/in\/set\/trim$/
const RE_STRIP_INV = /^\/(ch|aux)\/(\d+)\/in\/set\/inv$/
const RE_ALT_SRC = /^\/(ch|aux)\/(\d+)\/in\/set\/altsrc$/
const RE_SEND_MODE = /^\/(ch|aux)\/(\d+)\/send\/(\d+)\/mode$/
const RE_CONN_GRP = /^\/(ch|aux)\/(\d+)\/in\/conn\/grp$/
const RE_CONN_IN = /^\/(ch|aux)\/(\d+)\/in\/conn\/in$/
const RE_AES_STAT = /^\/([$\w]+)\/(A|B|C)\/stat$/

export type VariableUpdate = { name: string; value: string | number }
export class VariableHandler extends EventEmitter {
	private model: ModelSpec
	private readonly messages = new Set<OscMessage>()
	private readonly debounceUpdateVariables: () => void
	private logger: ModuleLogger | undefined

	private variables: { variableId: string; name: string }[] = []

	constructor(model: ModelSpec, updateRate?: number, logger?: ModuleLogger) {
		super()
		this.model = model
		this.logger = logger

		this.debounceUpdateVariables = debounceFn(
			() => {
				this.updateVariables()
				this.messages.clear()
			},
			{
				wait: updateRate ?? 50,
				before: false,
				after: true,
			},
		)
	}

	// Default value for a strip name variable, e.g. "bus6_name" -> "Bus 6". Returns undefined
	// for variables that are not strip names (so they are left unseeded).
	private static readonly NAME_LABELS: Record<string, string> = {
		ch: 'Ch',
		aux: 'Aux',
		bus: 'Bus',
		mtx: 'Mtx',
		main: 'Main',
		dca: 'DCA',
	}
	private static defaultNameValue(variableId: string): string | undefined {
		const m = variableId.match(/^(ch|aux|bus|mtx|main|dca)(\d+)_name$/)
		if (!m) return undefined
		return `${VariableHandler.NAME_LABELS[m[1]]} ${m[2]}`
	}

	setupVariables(): void {
		this.logger?.info('Setting up variables')
		const vars = getAllVariables(this.model)

		this.variables.push({ variableId: 'desk_ip', name: 'Desk IP Address' })
		this.variables.push({ variableId: 'desk_name', name: 'Desk Name' })
		this.variables.push({ variableId: 'main_alt_status', name: 'Main/Alt Input Source' })

		this.variables.push(...vars.map((v) => ({ variableId: v.variableId, name: v.name })))

		this.logger?.info(`Defined ${this.variables.length} variables`)

		// Companion base v2 expects an object keyed by variableId, not an array
		const definitions: CompanionVariableDefinitions = {}
		for (const v of this.variables) {
			definitions[v.variableId] = { name: v.name }
		}
		this.emit('create-variables', definitions)

		// Seed strip name variables with a sensible default (e.g. "Bus 6") so they are never
		// blank. Real names from the console overwrite these; empty names keep the default
		// (see updateNameVariables). This makes name-based button text robust without relying
		// on Companion expression fallbacks.
		const seed: CompanionVariableValues = {}
		for (const v of this.variables) {
			const def = VariableHandler.defaultNameValue(v.variableId)
			if (def !== undefined) seed[v.variableId] = def
		}
		if (Object.keys(seed).length > 0) this.emit('update-variables', seed)
	}

	updateVariables(): void {
		const messages = [...this.messages]
		if (messages.length === 0) {
			return
		}

		const updates: VariableUpdate[] = []
		for (const message of messages) {
			const path = message.address
			const args = message.args as osc.MetaArgument[]

			// Wing response formats:
			//   /*S push  (1 arg):  [actual_value:f/i]
			//   query     (3 args): [display_string:s, normalized:f, actual_value:f/i]
			// Always extract the actual value from args[2] when 3 args are present.
			const actualArg = args.length >= 3 ? args[2] : args[0]
			const actualValue = actualArg?.value

			const result =
				this.updateNameVariables(path, args[0]?.value as string) ??
				this.updateGainVariables(path, actualValue as number) ??
				this.updateMuteVariables(path, actualValue as number) ??
				this.updateFaderVariables(path, actualValue as number) ??
				this.updatePanoramaVariables(path, actualValue as number) ??
				this.updateUsbVariables(path, actualArg) ??
				this.updateSdVariables(path, actualArg) ??
				this.updateTalkbackVariables(path, actualArg) ??
				this.updateGpioVariables(path, actualValue as number) ??
				this.updateControlVariables(path, actualArg) ??
				this.updateIoVariables(path, actualArg) ??
				this.updateStatusVariables(path, actualValue as string) ??
				this.updateSendModeVariables(path, actualValue as string) ??
				this.updateInputPatchVariables(path, actualArg) ??
				this.updateStripInputVariables(path, actualArg) ??
				this.updateColorVariables(path, actualValue as string) ??
				this.updateFxVariables(path, actualArg)

			if (result) {
				updates.push(...result)
			}
		}
		const variables: CompanionVariableValues = {}
		for (const { name, value } of updates) {
			if (name === undefined || value === undefined) continue
			variables[name] = value
		}
		this.emit('update-variables', variables)
	}

	private updateNameVariables(path: string, value: string): VariableUpdate[] | undefined {
		const match = path.match(RE_NAME)
		if (!match) {
			return
		}

		// Keep the seeded default (e.g. "Bus 6") when the console reports an empty name.
		if (value === undefined || value === null || String(value).trim() === '') {
			return
		}

		const base = match[1]
		const num = match[2]
		return [{ name: `${base}${num}_name`, value }]
	}

	private updateGainVariables(path: string, value: number): VariableUpdate[] | undefined {
		const match = path.match(RE_GAIN)
		if (!match) {
			return
		}

		const base = match[1]
		const num = match[2]
		value = this.round(value, 1)
		return [{ name: `${base}${num}_gain`, value }]
	}

	private updateMuteVariables(path: string, value: number): VariableUpdate[] | undefined {
		const match = path.match(RE_MUTE)

		if (!match) return

		const source = match[1]
		const srcnum = parseInt(match[2])
		const section = match[3] ?? null
		let dest: string | null = null
		let destnum: number | null = null
		if (match[4] === 'MX') {
			dest = 'MX'
			destnum = parseInt(match[5])
		} else if (match[6]) {
			dest = section
			destnum = parseInt(match[6])
		}
		const action = match[7] ?? match[8]

		if (dest == null) {
			// Invert /mute to get mute state
			const muteValue = action === 'on' ? Number(!(value == 1)) : value
			return [{ name: `${source}${srcnum}_mute`, value: muteValue }]
		} else {
			if (dest === 'send') dest = 'bus'
			else if (dest === 'MX') dest = 'mtx'

			if (action === 'on') {
				// Emit both the inverted _mute and the raw _on variable
				return [
					{ name: `${source}${srcnum}_${dest}${destnum}_mute`, value: Number(!(value == 1)) },
					{ name: `${source}${srcnum}_${dest}${destnum}_on`, value },
				]
			}
			return [{ name: `${source}${srcnum}_${dest}${destnum}_mute`, value }]
		}
	}

	private updateFaderVariables(path: string, value: number): VariableUpdate[] | undefined {
		const match = path.match(RE_FADER)

		if (!match) {
			return
		}
		const source = `${match[1]}${match[2]}`
		let destination = null
		if (match[3] && match[4]) {
			destination = `${match[3]}${match[4]}`
		}

		if (destination) {
			if (/^send(\d+)$/.test(destination)) {
				destination = destination.replace(/^send(\d+)$/, 'bus$1')
			} else if (/^sendMX(\d+)$/.test(destination)) {
				destination = destination.replace(/^sendMX(\d+)$/, 'mtx$1')
			}
		}
		let varName: string
		if (destination) {
			varName = `${source}_${destination}_level`
		} else {
			varName = `${source}_level`
		}

		value = this.round(value, 1)
		if (value > -140) {
			return [{ name: varName, value }]
		} else {
			return [{ name: varName, value: '-oo' }]
		}
	}

	private updatePanoramaVariables(path: string, value: number): VariableUpdate[] | undefined {
		const match = path.match(RE_PAN)

		if (!match) {
			return
		}
		const source = `${match[1]}${match[2]}`
		let destination = null
		if (match[3] && match[4]) {
			destination = `${match[3]}${match[4]}`
		}

		if (destination) {
			if (/^send(\d+)$/.test(destination)) {
				destination = destination.replace(/^send(\d+)$/, 'bus$1')
			} else if (/^sendMX(\d+)$/.test(destination)) {
				destination = destination.replace(/^sendMX(\d+)$/, 'mtx$1')
			}
		}

		let varName: string
		if (destination) {
			varName = `${source}_${destination}_pan`
		} else {
			varName = `${source}_pan`
		}
		value = this.round(value, 0)
		return [{ name: varName, value: Math.round(value) }]
	}

	private updateUsbVariables(path: string, args: OSCMetaArgument): VariableUpdate[] | undefined {
		const match = path.match(RE_USB)
		if (!match) {
			return
		}
		const direction = match[1]
		const command = match[2]
		if (direction == 'rec') {
			if (command == '$time') {
				const seconds = args.value as number
				const totalSeconds = seconds.toString()
				const totalMinutes = Math.floor(seconds / 60)
					.toString()
					.padStart(3, '0')
				const remainderSeconds = (seconds % 60).toString().padStart(2, '0')
				const hours = Math.floor(seconds / 3600)
					.toString()
					.padStart(2, '0')
				const minutesWithinHour = Math.floor((seconds % 3600) / 60)
					.toString()
					.padStart(2, '0')
				const secondsWithinMinute = (seconds % 60).toString().padStart(2, '0')
				return [
					{ name: 'usb_record_time_ss', value: totalSeconds },
					{ name: 'usb_record_time_mm_ss', value: `${totalMinutes}:${remainderSeconds}` },
					{ name: 'usb_record_time_hh_mm_ss', value: `${hours}:${minutesWithinHour}:${secondsWithinMinute}` },
				]
			} else if (command == '$actfile') {
				const filename = args.value as string
				return [{ name: 'usb_record_path', value: filename }]
			} else if (command == '$actstate') {
				const state = args.value as string
				return [{ name: 'usb_record_state', value: state }]
			}
		} else if (direction == 'play') {
			if (command == '$pos') {
				const seconds = args.value as number
				const totalSeconds = seconds.toString()
				const totalMinutes = Math.floor(seconds / 60)
					.toString()
					.padStart(3, '0')
				const remainderSeconds = (seconds % 60).toString().padStart(2, '0')
				const hours = Math.floor(seconds / 3600)
					.toString()
					.padStart(2, '0')
				const minutesWithinHour = Math.floor((seconds % 3600) / 60)
					.toString()
					.padStart(2, '0')
				const secondsWithinMinute = (seconds % 60).toString().padStart(2, '0')
				return [
					{ name: 'usb_play_pos_ss', value: totalSeconds },
					{ name: 'usb_play_pos_mm_ss', value: `${totalMinutes}:${remainderSeconds}` },
					{ name: 'usb_play_pos_hh_mm_ss', value: `${hours}:${minutesWithinHour}:${secondsWithinMinute}` },
				]
			} else if (command == '$total') {
				const seconds = args.value as number
				const totalSeconds = seconds.toString()
				const totalMinutes = Math.floor(seconds / 60)
					.toString()
					.padStart(3, '0')
				const remainderSeconds = (seconds % 60).toString().padStart(2, '0')
				const hours = Math.floor(seconds / 3600)
					.toString()
					.padStart(2, '0')
				const minutesWithinHour = Math.floor((seconds % 3600) / 60)
					.toString()
					.padStart(2, '0')
				const secondsWithinMinute = (seconds % 60).toString().padStart(2, '0')
				return [
					{ name: 'usb_play_total_ss', value: totalSeconds },
					{ name: 'usb_play_total_mm_ss', value: `${totalMinutes}:${remainderSeconds}` },
					{ name: 'usb_play_total_hh_mm_ss', value: `${hours}:${minutesWithinHour}:${secondsWithinMinute}` },
				]
			} else if (command == '$actfile') {
				const filename = args.value as string
				return [{ name: 'usb_play_path', value: filename }]
			} else if (command == '$actstate') {
				const state = args.value as string
				return [{ name: 'usb_play_state', value: state }]
			} else if (command == '$song') {
				const song = args.value as string
				return [{ name: 'usb_play_name', value: song }]
			} else if (command == '$album') {
				const album = args.value as string
				return [{ name: 'usb_play_directory', value: album }]
			} else if (command == '$actlist') {
				const playlist = args.value as string
				return [{ name: 'usb_play_playlist', value: playlist }]
			} else if (command == '$actidx') {
				const index = args.value as number
				return [{ name: 'usb_play_playlist_index', value: index }]
			} else if (command == 'repeat') {
				const repeat = args.value as number
				return [{ name: 'usb_play_repeat', value: repeat }]
			}
		}
		return
	}

	private updateSdVariables(path: string, args: OSCMetaArgument): VariableUpdate[] | undefined {
		// Check for SD link status first
		if (path === '/cards/wlive/$actlink' || path === '/cards/wlive/sdlink') {
			const linkStatus = args.value as string
			return [{ name: 'wlive_link_status', value: linkStatus }]
		}

		const match = path.match(RE_SD)

		if (!match) {
			return
		}
		const card = match[1]
		const command = match[2]
		const subcommand = match[3]

		if (command == '$stat') {
			if (subcommand == 'state') {
				let state = args.value as string
				if (state == 'PPAUSE') {
					state = 'PAUSE'
				}
				return [{ name: `wlive_${card}_state`, value: state }]
			} else if (subcommand == 'sdstate') {
				const state = args.value as string
				return [{ name: `wlive_${card}_sdstate`, value: state }]
			} else if (subcommand == 'sdsize') {
				const state = args.value as number
				return [{ name: `wlive_${card}_sdsize`, value: state }]
			} else if (subcommand == 'markers') {
				const state = args.value as number
				return [{ name: `wlive_${card}_marker_total`, value: state }]
			} else if (subcommand == 'markerpos') {
				const state = args.value as number
				return [{ name: `wlive_${card}_marker_current`, value: state }]
			} else if (subcommand == 'sessions') {
				const state = args.value as number
				return [{ name: `wlive_${card}_session_total`, value: state }]
			} else if (subcommand == 'sessionpos') {
				const state = args.value as number
				return [{ name: `wlive_${card}_session_current`, value: state }]
			} else if (subcommand == 'markerlist') {
				const state = args.value as string
				return [{ name: `wlive_${card}_marker_time`, value: state }]
			} else if (subcommand == 'etime') {
				if (args.type !== 'f' && args.type !== 'i') return
				const seconds = Math.floor(args.value / 1000)
				const hours = Math.floor(seconds / 3600)
					.toString()
					.padStart(2, '0')
				const minutesWithinHour = Math.floor((seconds % 3600) / 60)
					.toString()
					.padStart(2, '0')
				const secondsWithinMinute = (seconds % 60).toString().padStart(2, '0')
				return [
					{ name: `wlive_${card}_elapsed_time_ss`, value: seconds.toString() },
					{
						name: `wlive_${card}_elapsed_time_mm_ss`,
						value: `${Math.floor(seconds / 60)
							.toString()
							.padStart(3, '0')}:${secondsWithinMinute}`,
					},
					{
						name: `wlive_${card}_elapsed_time_hh_mm_ss`,
						value: `${hours}:${minutesWithinHour}:${secondsWithinMinute}`,
					},
				]
			} else if (subcommand == 'sessionlen') {
				if (args.type !== 'f' && args.type !== 'i') return
				const seconds = Math.floor(args.value / 1000)
				const hours = Math.floor(seconds / 3600)
					.toString()
					.padStart(2, '0')
				const minutesWithinHour = Math.floor((seconds % 3600) / 60)
					.toString()
					.padStart(2, '0')
				const secondsWithinMinute = (seconds % 60).toString().padStart(2, '0')
				return [
					{ name: `wlive_${card}_session_len_ss`, value: seconds.toString() },
					{
						name: `wlive_${card}_session_len_mm_ss`,
						value: `${Math.floor(seconds / 60)
							.toString()
							.padStart(3, '0')}:${secondsWithinMinute}`,
					},
					{
						name: `wlive_${card}_session_len_hh_mm_ss`,
						value: `${hours}:${minutesWithinHour}:${secondsWithinMinute}`,
					},
				]
			} else if (subcommand == 'sdfree') {
				if (args.type !== 'f' && args.type !== 'i') return
				const seconds = Math.floor(args.value / 1000)
				const hours = Math.floor(seconds / 3600)
					.toString()
					.padStart(2, '0')
				const minutesWithinHour = Math.floor((seconds % 3600) / 60)
					.toString()
					.padStart(2, '0')
				const secondsWithinMinute = (seconds % 60).toString().padStart(2, '0')
				return [
					{ name: `wlive_${card}_sdfree_ss`, value: seconds.toString() },
					{
						name: `wlive_${card}_sdfree_mm_ss`,
						value: `${Math.floor(seconds / 60)
							.toString()
							.padStart(3, '0')}:${secondsWithinMinute}`,
					},
					{
						name: `wlive_${card}_sdfree_hh_mm_ss`,
						value: `${hours}:${minutesWithinHour}:${secondsWithinMinute}`,
					},
				]
			}
			return
		}
		return
	}

	private updateTalkbackVariables(path: string, args: OSCMetaArgument): VariableUpdate[] | undefined {
		const match = path.match(RE_TALKBACK)
		if (!match) {
			return
		}

		const talkback = match[1].toLowerCase()
		let destination: string
		if (match[2] == 'B') {
			destination = 'bus'
		} else if (match[2] == 'MX') {
			destination = 'mtx'
		} else if (match[2] == 'M') {
			destination = 'main'
		} else {
			return
		}
		const num = match[3]

		return [{ name: `talkback_${talkback}_${destination}${num}_assign`, value: args.value as number }]
	}

	private updateGpioVariables(path: string, value: number): VariableUpdate[] | undefined {
		const match = path.match(RE_GPIO)
		if (!match) {
			return
		}

		const gpio = match[1]
		return [{ name: `gpio${gpio}`, value }]
	}

	private updateControlVariables(path: string, args: OSCMetaArgument): VariableUpdate[] | undefined {
		const pathMatch = path.match(RE_CONTROL)
		if (!pathMatch) return

		const command = pathMatch[1]
		const subcommand = pathMatch[2]
		if (command == 'lib') {
			if (subcommand === '$actshow') {
				const fullShowPath = String(args.value)
				const showMatch = fullShowPath.match(/([^/\\]+)(?=\.show$)/)
				const showname = showMatch?.[1] ?? 'N/A'
				return [
					{ name: 'active_show_path', value: fullShowPath },
					{ name: 'active_show_name', value: showname },
				]
			} else if (subcommand === '$actidx') {
				const index = Number(args.value)
				return [{ name: 'active_show_index', value: index }, ...this.updateShowControlVariables(index)]
			} else if (subcommand === '$active') {
				const fullScenePath = String(args.value)
				const sceneMatch = fullScenePath.match(/([^/\\]+)[/\\]([^/\\]+)\..*$/)
				const scene = sceneMatch?.[2] ?? 'N/A'
				const parent = sceneMatch?.[1] ?? 'N/A'
				return [
					{ name: 'active_scene_name', value: scene },
					{ name: 'active_scene_folder', value: parent },
				]
			}
			return
		} else if (command === '$stat') {
			if (subcommand === 'sof') {
				let index = Number(args.value)
				if (args.type === 'i') {
					// recieved an int, which start at 0 instead of -1
					index = index - 1
				}
				return [
					{ name: 'sof_mode_index', value: index },
					{ name: 'sof_mode_string', value: ActionUtil.getStringFromStripIndex(index) },
				]
			} else if (subcommand === 'selidx') {
				let index = Number(args.value)
				// is arg a string or number?
				if (args.type === 'i') {
					// recieved an int, which start at 0 instead of 1
					index = index + 1
				}
				return [
					{ name: 'sel_index', value: index },
					{ name: 'sel_string', value: ActionUtil.getStringFromStripIndex(index) },
				]
			}
			return
		}
		return
	}

	private updateShowControlVariables(index: number): VariableUpdate[] {
		// const nameMap = self.state.sceneNameToIdMap

		const previous_number = index > 0 ? index - 1 : index
		const next_number = index + 1
		return [
			{ name: 'previous_scene_number', value: previous_number },
			{ name: 'active_scene_number', value: index },
			{ name: 'next_scene_number', value: next_number },
		]
		// const next_number = index < nameMap.size - 1 ? index + 1 : index

		// TODO: find a way to re-implement this nicely
		// function getKeyByValue(map: Map<string, number>, value: number): string | undefined {
		//     for (const [key, val] of map.entries()) {
		//         if (val === value) return key
		//     }
		//     return undefined
		// }

		// const nextName = getKeyByValue(nameMap, index + 1)
		// const currentName = getKeyByValue(nameMap, index)
		// const prevName = getKeyByValue(nameMap, index - 1)
		// this.emit('update-variable', 'previous_scene_name', prevName as string)
		// this.emit('update-variable', 'active_scene_name', currentName as string)
		// this.emit('update-variable', 'next_scene_name', nextName as string)
	}

	private updateStripInputVariables(path: string, arg: OSCMetaArgument): VariableUpdate[] | undefined {
		// Stereo width: /ch/N/wid, /aux/N/wid, /bus/N/wid, etc.
		const widMatch = path.match(RE_STRIP_WID)
		if (widMatch) return [{ name: `${widMatch[1]}${widMatch[2]}_wid`, value: this.round(arg?.value as number, 0) }]

		// Input trim: /ch/N/in/set/trim, /aux/N/in/set/trim
		const trimMatch = path.match(RE_STRIP_TRIM)
		if (trimMatch) return [{ name: `${trimMatch[1]}${trimMatch[2]}_trim`, value: this.round(arg?.value as number, 1) }]

		// Phase invert: /ch/N/in/set/inv, /aux/N/in/set/inv
		const invMatch = path.match(RE_STRIP_INV)
		if (invMatch) return [{ name: `${invMatch[1]}${invMatch[2]}_inv`, value: arg?.value as number }]

		// Alt source: /ch/N/in/set/altsrc, /aux/N/in/set/altsrc
		const altMatch = path.match(RE_ALT_SRC)
		if (altMatch) {
			const raw = arg?.value
			const isAlt = typeof raw === 'number' ? raw === 1 : String(raw).trim() === '1'
			return [{ name: `${altMatch[1]}${altMatch[2]}_alt`, value: isAlt ? 'Alt' : 'Main' }]
		}

		return undefined
	}

	private updateIoVariables(path: string, arg: OSCMetaArgument): VariableUpdate[] | undefined {
		const altsw = IoCommands.MainAltSwitch()
		if (path !== altsw) return

		let isMain = false
		const raw = arg?.value as unknown
		if (typeof raw === 'number') {
			// Wing: 0=Main, 1=Alt
			isMain = raw === 0
		} else if (typeof raw === 'string') {
			const s = raw.trim().toLowerCase()
			if (s === 'main') isMain = true
			else if (s === 'alt') isMain = false
			else if (s === '0') isMain = true
			else if (s === '1') isMain = false
			else {
				const n = Number.parseFloat(s)
				if (!Number.isNaN(n)) isMain = n === 0
			}
		}

		return [{ name: 'main_alt_status', value: isMain ? 'Main' : 'Alt' }]
	}

	private updateStatusVariables(path: string, value: string): VariableUpdate[] | undefined {
		// AES50 link state: /$stat/A/stat, /$stat/B/stat, /$stat/C/stat
		const aesMatch = path.match(RE_AES_STAT)
		if (aesMatch) {
			const port = aesMatch[2].toLowerCase()
			return [{ name: `stat_aes50${port}`, value: value ?? '' }]
		}
		return undefined
	}

	private updateSendModeVariables(path: string, value: string): VariableUpdate[] | undefined {
		// Send mode: /ch|aux/N/send/B/mode → ch_N_bus_B_mode / aux_N_bus_B_mode
		const m = path.match(RE_SEND_MODE)
		if (!m) return undefined
		return [{ name: `${m[1]}${m[2]}_bus${m[3]}_mode`, value: value ?? '' }]
	}

	private updateInputPatchVariables(path: string, arg: OSCMetaArgument): VariableUpdate[] | undefined {
		// Input source group: /ch|aux/N/in/conn/grp → {type}_N_src_grp
		const grpMatch = path.match(RE_CONN_GRP)
		if (grpMatch) {
			return [{ name: `${grpMatch[1]}${grpMatch[2]}_src_grp`, value: (arg?.value as string) ?? '' }]
		}
		// Input source index: /ch|aux/N/in/conn/in → {type}_N_src_in
		const inMatch = path.match(RE_CONN_IN)
		if (inMatch) {
			return [{ name: `${inMatch[1]}${inMatch[2]}_src_in`, value: (arg?.value as string | number) ?? '' }]
		}
		return undefined
	}

	private updateColorVariables(path: string, value: string): VariableUpdate[] | undefined {
		const match = path.match(RE_COLOR)
		if (!match) {
			return
		}

		const base = match[1]
		const num = match[2]
		return [{ name: `${base}${num}_color`, value }]
	}

	private updateFxVariables(path: string, args: osc.MetaArgument): VariableUpdate[] | undefined {
		const match = path.match(RE_FX)
		if (!match) return

		const fx = match[1]
		const param = match[2]
		if (param === 'mdL') return [{ name: `fx${fx}_model`, value: args.value as string }]
		if (param === 'fxmix') return [{ name: `fx${fx}_fxmix`, value: args.value as number }]
		return undefined
	}

	processMessage(msgs: Set<OscMessage>): void {
		msgs.forEach((msg) => this.messages.add(msg))
		this.debounceUpdateVariables()
	}

	destroy(): void {}

	round(num: number, precision: number): number {
		return Math.round(num * Math.pow(10, precision)) / Math.pow(10, precision)
	}
}
