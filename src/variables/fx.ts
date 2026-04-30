import { ModelSpec } from '../models/types.js'
import { VariableDefinition } from './index.js'
import * as Commands from '../commands/index.js'

export function getFxVariables(model: ModelSpec): VariableDefinition[] {
	const variables: VariableDefinition[] = []

	for (let fx = 1; fx <= model.effects; fx++) {
		variables.push({
			variableId: `fx${fx}_model`,
			name: `FX ${fx} Model`,
			path: Commands.Effect.Model(fx),
		})
		variables.push({
			variableId: `fx${fx}_fxmix`,
			name: `FX ${fx} Mix % (0=muted)`,
			path: Commands.Effect.FxMix(fx),
		})
	}

	return variables
}
