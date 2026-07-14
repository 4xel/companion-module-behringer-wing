import { CompanionActionDefinitions } from '@companion-module/base'
import { createChannelActions } from '../actions/channel.js'
import { createConfigurationActions } from '../actions/config.js'
import { GetOtherActions as createOtherActions } from './other.js'
import { createBusActions as createBusActions } from './bus.js'
import { InstanceBaseExt } from '../types.js'
import { WingConfig } from '../config.js'
import { createAuxActions } from './auxes.js'
import { createMainActions } from './main.js'
import { createMatrixActions } from './matrix.js'
import { createUsbPlayerActions } from './usbplayer.js'
import { createCardsActions } from './cards.js'
import { createCommonActions } from './common.js'
import { createControlActions } from './control.js'
import { createIoActions } from './io.js'
import { createFxActions } from './fx.js'
import { createTalkbackSwitcherActions } from './talkback.js'

export function createActions(self: InstanceBaseExt<WingConfig>): CompanionActionDefinitions {
	const actions = {
		...createCommonActions(self),
		...createOtherActions(self),
		...createChannelActions(self),
		...createBusActions(self),
		...createAuxActions(self),
		...createMainActions(self),
		...createMatrixActions(self),
		...createUsbPlayerActions(self),
		...createCardsActions(self),
		...createConfigurationActions(self),
		...createControlActions(self),
		...createIoActions(self),
		...createFxActions(self),
		...createTalkbackSwitcherActions(self),
	}

	// Companion base v2 requires `optionsToMonitorForSubscribe` on any action that
	// defines a `subscribe` hook. Default it to all of the action's option ids, which
	// reproduces the v1 behaviour of re-running subscribe/unsubscribe on any option change.
	for (const action of Object.values(actions)) {
		const entry = action as
			{ subscribe?: unknown; optionsToMonitorForSubscribe?: string[]; options?: { id: string }[] } | undefined
		if (entry && typeof entry.subscribe === 'function' && !entry.optionsToMonitorForSubscribe) {
			entry.optionsToMonitorForSubscribe = (entry.options ?? []).map((option) => option.id)
		}
	}

	return actions as CompanionActionDefinitions
}
