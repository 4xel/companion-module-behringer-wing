import { CompanionActionWithCallback, WingActionDefinitions } from './common.js'
import { InstanceBaseExt } from '../types.js'
import { WingConfig } from '../config.js'

export enum MainActions {}

export function createMainActions(_self: InstanceBaseExt<WingConfig>): WingActionDefinitions {
	const actions: { [id in MainActions]: CompanionActionWithCallback | undefined } = {}
	return actions
}
