import { ModelSpec } from '../models/types.js'
import { VariableDefinition } from './index.js'
import * as Commands from '../commands/index.js'

export function getBusVariables(model: ModelSpec): VariableDefinition[] {
	const variables: VariableDefinition[] = []

	for (let bus = 1; bus <= model.busses; bus++) {
		variables.push({ variableId: `bus${bus}_name`, name: `Bus ${bus} Name`, path: Commands.Bus.Name(bus) })
		variables.push({ variableId: `bus${bus}_mute`, name: `Bus ${bus} Mute`, path: Commands.Bus.Mute(bus) })
		variables.push({ variableId: `bus${bus}_level`, name: `Bus ${bus} Level`, path: Commands.Bus.Fader(bus) })
		variables.push({ variableId: `bus${bus}_pan`, name: `Bus ${bus} Pan`, path: Commands.Bus.Pan(bus) })
		for (let main = 1; main <= model.mains; main++) {
			variables.push({
				variableId: `bus${bus}_main${main}_mute`,
				name: `Bus ${bus} to Main ${main} Mute`,
			})
			variables.push({
				variableId: `bus${bus}_main${main}_level`,
				name: `Bus ${bus} to Main ${main} Level`,
			})
		}
		for (let send = 1; send <= model.busses; send++) {
			if (bus == send) {
				continue
			}
			variables.push({
				variableId: `bus${bus}_bus${send}_mute`,
				name: `Bus ${bus} to Bus ${send} Mute`,
			})
			variables.push({
				variableId: `bus${bus}_bus${send}_level`,
				name: `Bus ${bus} to Bus ${send} Level`,
			})
			variables.push({
				variableId: `bus${bus}_bus${send}_pan`,
				name: `Bus ${bus} to Bus ${send} Pan`,
			})
		}
		for (let mtx = 1; mtx <= model.matrices; mtx++) {
			variables.push({
				variableId: `bus${bus}_mtx${mtx}_mute`,
				name: `Bus ${bus} to Matrix ${mtx} Mute`,
			})
			variables.push({
				variableId: `bus${bus}_mtx${mtx}_level`,
				name: `Bus ${bus} to Matrix ${mtx} Level`,
			})
		}

		variables.push({
			variableId: `bus${bus}_color`,
			name: `Bus ${bus} Color`,
		})
	}

	return variables
}
