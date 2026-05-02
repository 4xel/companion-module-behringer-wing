import { ModelSpec } from '../models/types.js'
import { VariableDefinition } from './index.js'
import { GAIN_QUEUE_SLOTS } from '../handlers/gain-compensation-handler.js'

export function getCompensationVariables(model: ModelSpec): VariableDefinition[] {
	const vars: VariableDefinition[] = [
		{ variableId: 'comp_enabled', name: 'Gain Comp Enabled (0/1)' },
		{ variableId: 'comp_mode', name: 'Gain Comp Mode (auto/manual)' },
		{ variableId: 'comp_snapshot_time', name: 'Gain Comp Snapshot Time' },
	]
	for (let ch = 1; ch <= model.channels; ch++) {
		vars.push({ variableId: `ch${ch}_comp_delta`, name: `CH${ch} Gain Delta from Ref (dB)` })
		vars.push({ variableId: `ch${ch}_trim_ok`, name: `CH${ch} Trim Compensation OK (0/1)` })
	}
	for (let i = 1; i <= GAIN_QUEUE_SLOTS; i++) {
		vars.push({ variableId: `comp_queue_name_${i}`, name: `Gain Queue Slot ${i} Channel Name` })
	}
	return vars
}
