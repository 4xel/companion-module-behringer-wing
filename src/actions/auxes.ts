import { CompanionActionWithCallback, WingActionDefinitions } from './common.js'
import { InstanceBaseExt } from '../types.js'
import { WingConfig } from '../config.js'

export enum AuxActions {}

export function createAuxActions(_self: InstanceBaseExt<WingConfig>): WingActionDefinitions {
	const actions: { [id in AuxActions]: CompanionActionWithCallback | undefined } = {}

	return actions
}
