import type { DropdownChoice } from '@companion-module/base'
import type { WingConfig } from './config.js'
import type { ModelSpec } from './models/types.js'
import { getIdLabelPair } from './choices/utils.js'

// Talkback destination groups are defined once in the connection config (a name + a set of
// destinations) and referenced by name from both the "All Call" action and the
// "All Selected Destinations Assigned" feedback, so a group's busses live in a single place.

export const TALKBACK_GROUP_COUNT = 8

/** All talkback-assignable destinations as dropdown choices, e.g. { id: '/bus/5', label: 'Bus 5' }. */
export function getTalkbackDestChoices(model: ModelSpec): DropdownChoice[] {
	const dests: DropdownChoice[] = []
	for (let bus = 1; bus <= model.busses; bus++) dests.push(getIdLabelPair(`/bus/${bus}`, `Bus ${bus}`))
	for (let mtx = 1; mtx <= model.matrices; mtx++) dests.push(getIdLabelPair(`/mtx/${mtx}`, `Matrix ${mtx}`))
	for (let main = 1; main <= model.mains; main++) dests.push(getIdLabelPair(`/main/${main}`, `Main ${main}`))
	return dests
}

export interface TalkbackGroup {
	id: string
	name: string
	dests: string[]
}

/** Groups defined in the config (only those with a non-empty name). */
export function getTalkbackGroups(config: WingConfig | undefined): TalkbackGroup[] {
	// The group fields are dynamic config keys, not part of the typed WingConfig shape.
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
	const cfg = config as Record<string, unknown> | undefined
	const groups: TalkbackGroup[] = []
	for (let i = 1; i <= TALKBACK_GROUP_COUNT; i++) {
		const name = ((cfg?.[`tbgroup${i}_name`] as string | undefined) ?? '').trim()
		if (name.length === 0) continue
		const dests = (cfg?.[`tbgroup${i}_dests`] as string[] | undefined) ?? []
		groups.push({ id: `group${i}`, name, dests })
	}
	return groups
}

/** Choices for a "Destination group" dropdown in an action/feedback. */
export function getTalkbackGroupChoices(config: WingConfig | undefined): DropdownChoice[] {
	return [
		getIdLabelPair('all', 'All destinations'),
		...getTalkbackGroups(config).map((g) => getIdLabelPair(g.id, g.name)),
		getIdLabelPair('custom', 'Custom (this button)'),
	]
}

/** Resolve a selected group id to its destination id list. */
export function resolveTalkbackGroupDests(
	config: WingConfig | undefined,
	groupId: string,
	model: ModelSpec,
	customDests: string[],
): string[] {
	if (groupId === 'custom') return customDests
	if (groupId === 'all') return getTalkbackDestChoices(model).map((d) => d.id as string)
	return getTalkbackGroups(config).find((g) => g.id === groupId)?.dests ?? []
}
