import { CompanionActionWithCallback, WingActionDefinitions } from './common.js'
import { InstanceBaseExt } from '../types.js'
import { WingConfig } from '../config.js'
import { GetDropdownWithVariables, GetNumberFieldWithVariables } from '../choices/common.js'
import * as ActionUtil from './utils.js'
import * as StateUtil from '../state/utils.js'
import { BusCommands } from '../commands/bus.js'
import { ChannelCommands } from '../commands/channel.js'
import { AuxCommands } from '../commands/auxes.js'
import { MainCommands } from '../commands/main.js'
import { MatrixCommands } from '../commands/matrix.js'

export enum BusActions {
	BusMasterRemaster = 'bus-master-remaster',
}

const FADER_MIN = -90
const FADER_MAX = 10
// OSC -oo is stored as -140; skip sends at or below this to avoid un-silencing muted sends
const FADER_SILENCE = -130

export function createBusActions(self: InstanceBaseExt<WingConfig>): WingActionDefinitions {
	const state = self.stateHandler?.state
	if (!state) throw new Error('State handler or state is not available')
	const model = self.model

	const ensureLoaded = (path: string): void => {
		self.connection?.sendCommand(path).catch(() => {})
	}

	const actions: { [id in BusActions]: CompanionActionWithCallback | undefined } = {
		[BusActions.BusMasterRemaster]: {
			name: 'Bus / Main / Matrix Remaster',
			description:
				'Move a bus, main, or matrix master fader by a given amount and offset all send levels into it by the inverse, keeping perceived SPL identical. Useful for re-centering gain structure after individual sends have crept to 0 dB.',
			options: [
				...GetDropdownWithVariables('Bus / Main / Matrix', 'bus', [
					...state.namedChoices.busses,
					...state.namedChoices.mains,
					...state.namedChoices.matrices,
				]),
				...GetNumberFieldWithVariables('Adjust (dB)', 'delta', -20, 20, 0.5, 1, ''),
			],
			callback: async (event) => {
				const send = self.connection!.sendCommand.bind(self.connection)
				const sel = ActionUtil.getStringWithVariables(event, 'bus')
				const num = ActionUtil.getNodeNumberFromID(sel)
				const delta = ActionUtil.getNumberWithVariables(event, 'delta')
				const isMain = sel.startsWith('/main/')
				const isMtx = sel.startsWith('/mtx/')

				const masterCmd = isMtx ? MatrixCommands.Fader(num) : isMain ? MainCommands.Fader(num) : BusCommands.Fader(num)

				ensureLoaded(masterCmd)

				if (isMtx) {
					for (let bus = 1; bus <= model.busses; bus++) {
						ensureLoaded(BusCommands.MatrixSendLevel(bus, num))
					}
					for (let main = 1; main <= model.mains; main++) {
						ensureLoaded(MainCommands.MatrixSendLevel(main, num))
					}
				} else {
					for (let ch = 1; ch <= model.channels; ch++) {
						ensureLoaded(isMain ? ChannelCommands.MainSendLevel(ch, num) : ChannelCommands.SendLevel(ch, num))
					}
					for (let aux = 1; aux <= model.auxes; aux++) {
						ensureLoaded(isMain ? AuxCommands.MainSendLevel(aux, num) : AuxCommands.SendLevel(aux, num))
					}
					if (isMain) {
						for (let bus = 1; bus <= model.busses; bus++) {
							ensureLoaded(BusCommands.MainSendLevel(bus, num))
						}
					}
				}

				// Apply after responses have arrived (~400 ms, matching gain comp pattern)
				setTimeout(() => {
					void (async () => {
						const currentFader = StateUtil.getNumberFromState(masterCmd, state)
						if (currentFader !== undefined) {
							const newFader = Math.max(FADER_MIN, Math.min(FADER_MAX, currentFader + delta))
							await send(masterCmd, newFader)
							state.set(masterCmd, [{ type: 'f', value: newFader }])
						}

						if (isMtx) {
							for (let bus = 1; bus <= model.busses; bus++) {
								const sendCmd = BusCommands.MatrixSendLevel(bus, num)
								const current = StateUtil.getNumberFromState(sendCmd, state)
								if (current !== undefined && current > FADER_SILENCE) {
									const newLevel = Math.max(FADER_MIN, Math.min(FADER_MAX, current - delta))
									await send(sendCmd, newLevel)
									state.set(sendCmd, [{ type: 'f', value: newLevel }])
								}
							}
							for (let main = 1; main <= model.mains; main++) {
								const sendCmd = MainCommands.MatrixSendLevel(main, num)
								const current = StateUtil.getNumberFromState(sendCmd, state)
								if (current !== undefined && current > FADER_SILENCE) {
									const newLevel = Math.max(FADER_MIN, Math.min(FADER_MAX, current - delta))
									await send(sendCmd, newLevel)
									state.set(sendCmd, [{ type: 'f', value: newLevel }])
								}
							}
						} else {
							for (let ch = 1; ch <= model.channels; ch++) {
								const sendCmd = isMain ? ChannelCommands.MainSendLevel(ch, num) : ChannelCommands.SendLevel(ch, num)
								const current = StateUtil.getNumberFromState(sendCmd, state)
								if (current !== undefined && current > FADER_SILENCE) {
									const newLevel = Math.max(FADER_MIN, Math.min(FADER_MAX, current - delta))
									await send(sendCmd, newLevel)
									state.set(sendCmd, [{ type: 'f', value: newLevel }])
								}
							}
							for (let aux = 1; aux <= model.auxes; aux++) {
								const sendCmd = isMain ? AuxCommands.MainSendLevel(aux, num) : AuxCommands.SendLevel(aux, num)
								const current = StateUtil.getNumberFromState(sendCmd, state)
								if (current !== undefined && current > FADER_SILENCE) {
									const newLevel = Math.max(FADER_MIN, Math.min(FADER_MAX, current - delta))
									await send(sendCmd, newLevel)
									state.set(sendCmd, [{ type: 'f', value: newLevel }])
								}
							}
							if (isMain) {
								for (let bus = 1; bus <= model.busses; bus++) {
									const sendCmd = BusCommands.MainSendLevel(bus, num)
									const current = StateUtil.getNumberFromState(sendCmd, state)
									if (current !== undefined && current > FADER_SILENCE) {
										const newLevel = Math.max(FADER_MIN, Math.min(FADER_MAX, current - delta))
										await send(sendCmd, newLevel)
										state.set(sendCmd, [{ type: 'f', value: newLevel }])
									}
								}
							}
						}
					})()
				}, 400)
			},
			subscribe: (event) => {
				const sel = ActionUtil.getStringWithVariables(event, 'bus')
				const num = ActionUtil.getNodeNumberFromID(sel)
				const isMain = sel.startsWith('/main/')
				const isMtx = sel.startsWith('/mtx/')

				ensureLoaded(isMtx ? MatrixCommands.Fader(num) : isMain ? MainCommands.Fader(num) : BusCommands.Fader(num))

				if (isMtx) {
					for (let bus = 1; bus <= model.busses; bus++) {
						ensureLoaded(BusCommands.MatrixSendLevel(bus, num))
					}
					for (let main = 1; main <= model.mains; main++) {
						ensureLoaded(MainCommands.MatrixSendLevel(main, num))
					}
				} else {
					for (let ch = 1; ch <= model.channels; ch++) {
						ensureLoaded(isMain ? ChannelCommands.MainSendLevel(ch, num) : ChannelCommands.SendLevel(ch, num))
					}
					for (let aux = 1; aux <= model.auxes; aux++) {
						ensureLoaded(isMain ? AuxCommands.MainSendLevel(aux, num) : AuxCommands.SendLevel(aux, num))
					}
					if (isMain) {
						for (let bus = 1; bus <= model.busses; bus++) {
							ensureLoaded(BusCommands.MainSendLevel(bus, num))
						}
					}
				}
			},
		},
	}

	return actions
}
