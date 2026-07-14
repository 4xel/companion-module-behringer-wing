import {
	InstanceBase,
	InstanceStatus,
	SomeCompanionConfigField,
	Regex,
	CompanionVariableValues,
} from '@companion-module/base'
import { InstanceBaseExt, WingSchema } from './types.js'
import { GetConfigFields, WingConfig } from './config.js'
import { UpgradeScripts } from './upgrades.js'
import { createActions } from './actions/index.js'
import { GetFeedbacksList } from './feedbacks.js'
import { OscMessage } from 'osc'
import { WingTransitions } from './handlers/transitions.js'
import { WingDeviceDetectorInstance, WingDeviceDetectorInterface } from './handlers/device-detector.js'
import { ModelSpec, WingModel } from './models/types.js'
import { getDeskModel } from './models/index.js'
import { GetPresets } from './presets.js'
import { ConnectionHandler } from './handlers/connection-handler.js'
import { StateHandler } from './handlers/state-handler.js'
import { FeedbackHandler } from './handlers/feedback-handler.js'
import { VariableHandler } from './handlers/variable-handler.js'
import { OscForwarder } from './handlers/osc-forwarder.js'
import debounceFn from 'debounce-fn'
import { ModuleLogger } from './handlers/logger.js'
import { CardsCommands } from './commands/cards.js'
import { GainCompensationHandler, GAIN_QUEUE_SLOTS } from './handlers/gain-compensation-handler.js'

export { UpgradeScripts }

export default class WingInstance extends InstanceBase<WingSchema> implements InstanceBaseExt<WingConfig> {
	private readonly debounceHandleMessages: () => void
	private readonly debouncedRebuildDefinitions: () => void
	private readonly messages = new Set<OscMessage>()

	config!: WingConfig
	model: ModelSpec

	/** Companion-side solo mode: false = additive, true = individual/exclusive. */
	soloExclusive: boolean = false

	connected: boolean = false
	private wlivePoller?: NodeJS.Timeout

	deviceDetector: WingDeviceDetectorInterface | undefined
	connection: ConnectionHandler | undefined
	stateHandler: StateHandler | undefined
	feedbackHandler: FeedbackHandler | undefined
	variableHandler: VariableHandler | undefined
	gainCompHandler: GainCompensationHandler | undefined
	transitions: WingTransitions
	oscForwarder: OscForwarder | undefined
	logger: ModuleLogger | undefined

	constructor(internal: unknown) {
		super(internal)
		this.model = getDeskModel(WingModel.Full) // later populated correctly
		this.transitions = new WingTransitions(this)
		this.debounceHandleMessages = debounceFn(
			() => {
				this.handleMessages()
				this.messages.clear()
			},
			{
				wait: 20,
				maxWait: 100,
				before: false,
				after: true,
			},
		)
		// Rebuilding action/feedback/preset definitions is expensive and pushes a large payload
		// over IPC. State updates arrive in bursts (e.g. as names load on connect), so debounce
		// the rebuild to coalesce them into one push instead of flooding the IPC channel.
		this.debouncedRebuildDefinitions = debounceFn(() => this.rebuildDefinitions(), {
			wait: 400,
			maxWait: 2000,
			before: false,
			after: true,
		})
	}

	/**
	 * Rebuild and push all action, feedback and preset definitions, then re-check feedbacks.
	 * Each set is a large IPC payload, so they are staggered to avoid flooding the channel.
	 */
	private rebuildDefinitions(): void {
		this.updateActions()
		setTimeout(() => this.updateFeedbacks(), 200)
		setTimeout(() => {
			const presetsData = GetPresets(this)
			this.setPresetDefinitions(presetsData.structure, presetsData.presets)
		}, 400)
		setTimeout(() => this.checkAllFeedbacks(), 600)
	}

	async init(config: WingConfig): Promise<void> {
		this.logger = new ModuleLogger(this.label)
		this.logger.setLoggerFn((level, message) => {
			this.log(level, message)
		})
		this.logger.debugMode = config.debugMode ?? false
		this.logger.timestamps = config.debugMode ?? false
		await this.configUpdated(config)
	}

	async destroy(): Promise<void> {
		this.deviceDetector?.unsubscribe(this.id)
		this.transitions.stopAll()
		this.stopWlivePoller()
		this.gainCompHandler?.destroy()
	}

	private start(config: WingConfig): void {
		this.setupDeviceDetector()
		this.setupConnectionHandler()
		this.setupStateHandler()
		this.setupFeedbackHandler()
		this.setupVariableHandler()
		this.setupGainCompHandler()
		this.transitions.setUpdateRate(config.fadeUpdateRate ?? 50)
		this.setupOscForwarder()
		// Push all definitions AFTER init() has returned, staggered, so init resolves promptly
		// and no single IPC burst (variables, actions, feedbacks, presets) overruns Companion's
		// call timeout. Building + sending everything inline was forcing an init restart loop.
		setTimeout(() => this.initializeDefinitions(), 800)
	}

	/**
	 * One-time, staggered push of every definition set after init() has returned. Each set is a
	 * large IPC payload, so they are spaced out to avoid flooding the channel and timing out.
	 */
	private initializeDefinitions(): void {
		this.variableHandler?.setupVariables()
		setTimeout(() => this.rebuildDefinitions(), 250)
	}

	private stop(): void {
		this.stopWlivePoller()
		this.gainCompHandler?.destroy()
		this.gainCompHandler = undefined
		this.connection?.close()
		this.stateHandler?.clearState()
		this.oscForwarder?.close()
		this.oscForwarder = undefined
		this.variableHandler?.destroy()
	}

	private setupGainCompHandler(): void {
		this.gainCompHandler = new GainCompensationHandler(this.model, this.logger)

		this.gainCompHandler.on('update-variables', (vars: CompanionVariableValues) => {
			this.setVariableValues(vars)
		})
		this.gainCompHandler.on('send', (cmd: string, val: number) => {
			this.connection?.sendCommand(cmd, val, true).catch(() => {})
		})
		this.gainCompHandler.on('ensure-loaded', (path: string) => {
			this.stateHandler?.ensureLoaded(path)
		})
		this.gainCompHandler.on('check-feedbacks', (ids: string[]) => {
			if (ids.length > 0) this.checkFeedbacks(...(ids as [string, ...string[]]))
		})
		this.gainCompHandler.on('queue-changed', (queue: number[]) => {
			const vars: CompanionVariableValues = {}
			for (let i = 0; i < GAIN_QUEUE_SLOTS; i++) {
				const ch = queue[i]
				vars[`comp_queue_name_${i + 1}`] =
					ch !== undefined ? (this.stateHandler?.state?.names.channels[ch - 1] ?? `CH${ch}`) : ''
			}
			this.setVariableValues(vars)
		})
	}

	private startWlivePoller(): void {
		this.stopWlivePoller()
		this.wlivePoller = setInterval(() => {
			// Poll the string-typed state path using fire-and-forget sendCommand instead
			// of ensureLoaded. ensureLoaded puts requests into the stateHandler queue with
			// a timeout; if WLive cards are not present Wing never responds, every request
			// times out, and orphaned promises accumulate — eventually clogging the queue
			// that gain/trim ensureLoaded calls also use. sendCommand is fire-and-forget:
			// the response is processed normally when it arrives, with no queue or timeout.
			for (let card = 1; card <= 2; card++) {
				this.connection?.sendCommand(CardsCommands.WLiveCardState(card)).catch(() => {})
			}
		}, 1000)
	}

	private stopWlivePoller(): void {
		if (this.wlivePoller) {
			clearInterval(this.wlivePoller)
			this.wlivePoller = undefined
		}
	}

	async configUpdated(config: WingConfig): Promise<void> {
		this.config = config
		this.model = getDeskModel(this.config.model)

		this.stop()
		this.start(config)
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields(this)
	}

	updateActions(): void {
		this.setActionDefinitions(createActions(this))
	}

	updateFeedbacks(): void {
		this.setFeedbackDefinitions(GetFeedbacksList(this))
	}

	private setupDeviceDetector(): void {
		this.deviceDetector = WingDeviceDetectorInstance
		if (this.logger !== undefined) {
			this.deviceDetector.addLogger(this.logger)
		}
		this.deviceDetector.subscribe(this.id)
		if (this.deviceDetector) {
			;(this.deviceDetector as any).on?.('no-device-detected', () => {
				this.logger?.warn('No console detected on the network')
				this.updateStatus(InstanceStatus.Disconnected, 'Unable to detect a console on the network')
			})
		}
	}

	private setupConnectionHandler(): void {
		this.connection = new ConnectionHandler(this.logger)

		const ipPattern = Regex.IP.replace(/^\/|\/$/g, '')
		const ipRegex = new RegExp(ipPattern)

		if (!ipRegex.test(this.config.host ?? '')) {
			this.updateStatus(InstanceStatus.BadConfig, 'No host configured')
		}

		this.connection.open('0.0.0.0', 0, this.config.host!, 2223)
		// Renew every 500ms — Wing's /*S subscription is last-sender-wins with ~10s expiry.
		// Other apps (Wing Remote, web interface) may compete; 500ms keeps us aggressive.
		this.connection.setSubscriptionInterval(this.config.subscriptionInterval ?? 500)
		this.connection.startSubscription()

		this.connection?.on('ready', () => {
			this.updateStatus(InstanceStatus.Connecting, 'Waiting for answer from console...')
			this.feedbackHandler?.startPolling()
			this.stateHandler?.state?.requestNames(this)
			if (this.config.prefetchVariablesOnStartup) {
				// Defer prefetch so its large query bursts don't flood the Wing while the paced
				// name/state queries from requestNames are still in flight (which caused replies
				// to be dropped and names to go missing).
				setTimeout(() => {
					void this.stateHandler?.state?.requestAllVariables(this)
				}, 3000)
			}
			this.stateHandler?.requestUpdate()
			this.startWlivePoller()
		})

		this.connection?.on('error', (err: Error) => {
			this.logger?.error(JSON.stringify(err))
			this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
		})

		this.connection?.on('close', () => {
			this.updateStatus(InstanceStatus.Disconnected, 'OSC connection closed')
			this.connected = false
			this.feedbackHandler?.startPolling()
			this.stateHandler?.clearState()
		})

		this.connection?.on('message', (msg: OscMessage) => {
			this.messages.add(msg)
			this.oscForwarder?.send(msg)
			this.debounceHandleMessages()
		})
	}

	private handleMessages(): void {
		if (this.connected == false) {
			this.updateStatus(InstanceStatus.Ok)
			this.connected = true

			this.logger?.info('OSC connection established')
			this.gainCompHandler?.takeSnapshot()
		}
		this.feedbackHandler?.clearPollTimeout()
		this.stateHandler?.processMessage(this.messages)
		this.feedbackHandler?.processMessage(this.messages)
		this.variableHandler?.processMessage(this.messages)
		this.gainCompHandler?.processMessage(this.messages)
	}

	private setupStateHandler(): void {
		this.stateHandler = new StateHandler(this.model, this.logger)
		this.stateHandler.setTimeout(this.config.requestTimeout ?? 200)

		this.stateHandler.on('request', (path: string, arg?: string | number) => {
			this.connection?.sendCommand(path, arg).catch(() => {})
		})

		this.stateHandler.on('request-failed', (path: string) => {
			if (this.config.panicOnLostRequest) {
				this.updateStatus(InstanceStatus.ConnectionFailure, `Request failed for ${path}`)
			}
		})

		this.stateHandler.on('update', () => {
			// Coalesce bursts of state updates into a single (debounced) definition rebuild.
			this.debouncedRebuildDefinitions()
		})
	}

	private setupFeedbackHandler(): void {
		this.feedbackHandler = new FeedbackHandler(this.logger)
		this.feedbackHandler.setPollInterval(this.config.statusPollUpdateRate ?? 3000)

		this.feedbackHandler.on('check-feedbacks', (feedbacks: string[]) => {
			if (feedbacks.length > 0) this.checkFeedbacks(...(feedbacks as [string, ...string[]]))
		})

		this.feedbackHandler.on('poll-request', (paths: string[]) => {
			paths.forEach((path) => {
				this.logger?.info(path)
				this.stateHandler?.ensureLoaded(path)
			})
		})

		this.feedbackHandler.on('poll-connection-timeout', () => {
			this.updateStatus(InstanceStatus.Disconnected, 'Connection timed out')
			this.connected = false
		})
	}

	private setupVariableHandler(): void {
		this.variableHandler = new VariableHandler(this.model, this.config.variableUpdateRate, this.logger)

		this.variableHandler.on('create-variables', (variables) => {
			this.setVariableDefinitions(variables)
		})

		this.variableHandler.on('update-variables', (updates: CompanionVariableValues) => {
			this.setVariableValues(updates)
		})

		this.variableHandler.on('send', (cmd: string, arg?: number | string) => {
			this.connection?.sendCommand(cmd, arg).catch(() => {})
		})
		// setupVariables() (which pushes ~1000 variable definitions over IPC) is deferred to
		// initializeDefinitions() so it doesn't run inside init().
	}

	private setupOscForwarder(): void {
		if (!this.oscForwarder) {
			this.oscForwarder = new OscForwarder(this.logger)
		}
		this.oscForwarder?.setup(
			this.config.enableOscForwarding,
			this.config.oscForwardingHost,
			this.config.oscForwardingPort,
		)
	}
}
