import { ModelSpec } from '../models/types.js'
import { VariableDefinition } from './index.js'

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
	return vars
}
