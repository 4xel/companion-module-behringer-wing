# Companion 5 migration — `@companion-module/base` 1.13 → 2.1

**Goal:** move this module from `@companion-module/base ~1.13` (Companion 4.x, API 1.x)
to `@companion-module/base 2.1.x` (Companion 5.0, API 2.1).

Companion 5 uses **API 2.1**, whose base package is **2.1.2** (`latest`). API 2.1 itself
added no breaking changes over 2.0 — **all the breaking work lives in the 2.0.0 jump**.
2.1 only adds features (abort signals, graphics overhaul, layered presets, Node 26 support).

The module is already ESM (`"type": "module"`, `.js` import specifiers, node22), so the
CommonJS→ESM transition is a non-issue. What remains is API-surface work.

## Version bumps

| Package                   | From     | To                                                    |
| ------------------------- | -------- | ----------------------------------------------------- |
| `@companion-module/base`  | `~1.13`  | `^2.1` (2.1.2)                                        |
| `@companion-module/tools` | `^2.6.1` | `^3.0` (3.0.2 — peer-requires base `^2.0.0`)          |
| Node engine               | `^22.20` | `^22.20 \|\| ^26.5` (26 optional; 22 still supported) |

## Breaking changes that affect this module

Ordered by effort. Each item lists the concrete sites found in `src/`.

### 1. Feedback `subscribe` callbacks removed — **largest task**

In base 2.0 `CompanionFeedbackDefinition` **no longer has a `subscribe` property**; only
`unsubscribe` remains. This module's entire OSC-subscription strategy is built on feedback
`subscribe:` handlers that call `ensureLoaded`/`subscribeFeedback` to register the OSC path.

- ~33 feedbacks in `src/feedbacks.ts` (66 `subscribe:`/`unsubscribe:` lines).
- **Migration:** move the subscription setup out of `subscribe:` and into the feedback
  `callback:` (the `callback` runs when the feedback is evaluated/registered; the v2 docs
  say `unsubscribe` is for "cleanup subscriptions setup in the callback"). Keep `unsubscribe:`
  for teardown. Practically: have `callback` ensure the OSC path is loaded/subscribed on
  first evaluation, then return the boolean/style as today.
- **Verify:** action `subscribe`/`unsubscribe` callbacks were _not_ removed (only feedbacks
  were called out in the 2.0 changelog). Actions in `bus/channel/matrix/control/fx/common`
  use `subscribe:` — confirm against the base 2.x action types before touching them.

### 2. `InstanceBase` generic changed — **strongly-typed manifest**

2.0 changed the class signature from `InstanceBase<TConfig>` to
`InstanceBase<TManifest extends InstanceTypes>`, where `InstanceTypes` is a nested shape
`{ config, secrets, actions, feedbacks, variables, compositeElements }`.

- `src/types.ts:6` — `InstanceBaseExt<TConfig> extends InstanceBase<TConfig>`
- `src/index.ts:30` — `class WingInstance extends InstanceBase<WingConfig>`
- Every `InstanceBaseExt<WingConfig>` consumer (`config.ts`, `feedbacks.ts`, `presets.ts`, …).
- **Migration:** define a manifest-shaped type (e.g. `WingInstanceTypes` with `config: WingConfig`)
  and thread it through `InstanceBaseExt` / `WingInstance`. This is mostly typing, not runtime,
  but it touches every file that references the generic.

### 3. `runEntrypoint` removed → default export

- `src/index.ts:3` imports `runEntrypoint`; `src/index.ts:327` calls
  `runEntrypoint(WingInstance, UpgradeScripts)`.
- **Migration:** remove the import/call and `export default WingInstance` instead. Upgrade
  scripts move to a static field / the manifest-declared location per the 2.x entrypoint contract.

### 4. `setVariableDefinitions` now takes an object, not an array

Base 2.0 throws if passed an array ("Variable definitions should be an object, not an array").

- `src/index.ts:301` — `this.setVariableDefinitions(variables)` where `variables` comes from
  `VariableHandler`'s `create-variables` event (currently an array).
- **Migration:** change `VariableHandler` to emit / build an object keyed by `variableId`
  (`{ [variableId]: { name } }`) instead of an array, or convert at the call site.

### 5. `isVisible` function → `isVisibleExpression` string

Most option fields already use `isVisibleExpression`. Residual `isVisible` **function**
callbacks remain and must be converted to expression strings:

- `src/choices/eq.ts:54`
- `src/choices/faderbanks.ts:210, 220, 230, 240, 252`
- **Migration:** rewrite each predicate as a Companion expression (e.g.
  `` `$(options:foo) == 'bar'` ``). The helpers in `src/choices/common.ts` already model this.

### 6. `InputValue` type removed → `JsonValue`

- `src/choices/common.ts:7` (import), `:851`, `:852` (param types).
- **Migration:** rename `InputValue` → `JsonValue` from `@companion-module/base`.

### 7. Learn callbacks return values only

2.0: learn callbacks return only option values, not identifier fields. The 6 learn callbacks
(`common.ts:379/498/613/1041`, `channel.ts:72`, `control.ts:76`) already return option-value
objects — **review only**, likely no change, but confirm none leak identifier fields.

### 8. Manifest `type` property required

Base 2.0 requires a `type` property in the manifest and adds stricter runtime validation.

- `companion/manifest.json` has `runtime.type: "node22"` and `runtime.apiVersion: "0.0.0"`.
- **Migration:** regenerate/validate the manifest against the `@companion-module/tools` 3.x
  schema (`companion-module-build`/dev tooling). Confirm the required `type` field and correct
  `apiVersion` are emitted; do not hand-edit if tooling owns it.

## Non-issues (verified clear in this codebase)

- `optionsToIgnoreForSubscribe` → `optionsToMonitorForSubscribe`: **0 usages**.
- `relativeDelay` removed from presets: **0 usages**.
- `parseVariablesInString` removed: only referenced in JSDoc comments, **0 runtime calls**.
- `CreateConvertToBooleanFeedbackUpgradeScript` relocation: **0 usages**.
- Feedback `imageBuffer` format change: **0 usages**.
- ESM transition: already ESM.
- `checkFeedbacks` (4 sites): still supported; `checkAllFeedbacks` added as an option.

## Suggested order of work

1. Bump `base`/`tools`/node in `package.json`, `yarn install`, regenerate manifest (items 1, 8).
2. `runEntrypoint` → default export (item 3) — unblocks the module loading at all.
3. `InstanceBase` generic / manifest typing (item 2) — unblocks the typecheck everywhere.
4. `setVariableDefinitions` object shape (item 4).
5. Feedback `subscribe` → `callback` rework (item 1) — the substantive behavioural change.
6. `isVisible`→expression, `InputValue`→`JsonValue`, learn review (items 5–7).
7. `yarn build` + `yarn lint` clean, then `yarn test` / integration tests against a Wing.

## Sources

- Module API changelog (API 2.0 = Companion 4.3+, API 2.1 = Companion 5.0+):
  https://companion.free/for-developers/module-development/api-changes/
- Base 2.0 breaking changes (raw changelog):
  https://raw.githubusercontent.com/bitfocus/companion-module-base/main/packages/base/CHANGELOG.md
- Feedback definition (subscribe removed) source:
  https://raw.githubusercontent.com/bitfocus/companion-module-base/main/packages/base/src/module-api/feedback.ts
- `InstanceBase` / `setVariableDefinitions` source:
  https://raw.githubusercontent.com/bitfocus/companion-module-base/main/packages/base/src/module-api/base.ts
- npm dist-tags: `@companion-module/base@2.1.2` (latest), `@companion-module/tools@3.0.2` (latest).
