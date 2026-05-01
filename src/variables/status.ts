import { VariableDefinition } from './index.js'
import { StatusCommands } from '../commands/status.js'

export function getStatusVariables(): VariableDefinition[] {
	return [
		{ variableId: 'stat_aes50a', name: 'AES50-A Link Status', path: StatusCommands.AesStatus('A') },
		{ variableId: 'stat_aes50b', name: 'AES50-B Link Status', path: StatusCommands.AesStatus('B') },
		{ variableId: 'stat_aes50c', name: 'AES50-C Link Status', path: StatusCommands.AesStatus('C') },
		{ variableId: 'stat_aes50a_dev', name: 'AES50-A Device Name', path: StatusCommands.AesDeviceName('A') },
		{ variableId: 'stat_aes50b_dev', name: 'AES50-B Device Name', path: StatusCommands.AesDeviceName('B') },
		{ variableId: 'stat_aes50c_dev', name: 'AES50-C Device Name', path: StatusCommands.AesDeviceName('C') },
		{ variableId: 'stat_clock_lock', name: 'Clock Lock State', path: StatusCommands.ClockLock() },
		{ variableId: 'stat_usb', name: 'USB Drive State', path: StatusCommands.USBState() },
		{ variableId: 'stat_solo', name: 'Solo Active (0/1)', path: StatusCommands.Solo() },
		{ variableId: 'stat_stageconnect', name: 'StageConnect Status', path: StatusCommands.StageConnectStatus() },
	]
}
