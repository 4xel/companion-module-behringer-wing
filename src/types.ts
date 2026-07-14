import { InstanceBase, InstanceTypes, JsonObject } from '@companion-module/base'
import type { WingConfig } from './config.js'
import { WingTransitions } from './handlers/transitions.js'
import { ModelSpec } from './models/types.js'
import { ModuleLogger } from './handlers/logger.js'

/**
 * The manifest-shaped generic that `@companion-module/base` v2 expects on
 * `InstanceBase`. We keep the `InstanceBaseExt<TConfig>` signature so existing
 * call sites don't churn, but the config is wrapped into the v2 schema shape.
 */
export type WingSchema<TConfig extends JsonObject = WingConfig> = {
	config: TConfig
	secrets: undefined
	actions: InstanceTypes['actions']
	feedbacks: InstanceTypes['feedbacks']
	variables: InstanceTypes['variables']
}

export interface InstanceBaseExt<TConfig extends JsonObject> extends InstanceBase<WingSchema<TConfig>> {
	config: TConfig
	transitions: WingTransitions
	// subscriptions: WingSubscriptions
	model: ModelSpec
	logger?: ModuleLogger

	connection?: import('./handlers/connection-handler.js').ConnectionHandler | undefined
	stateHandler?: import('./handlers/state-handler.js').StateHandler | undefined
	feedbackHandler?: import('./handlers/feedback-handler.js').FeedbackHandler | undefined
	variableHandler?: import('./handlers/variable-handler.js').VariableHandler | undefined
	gainCompHandler?: import('./handlers/gain-compensation-handler.js').GainCompensationHandler | undefined
}
