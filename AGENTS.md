# AGENTS.md

## Environment

- **Disk C has 0 bytes free.** All npm commands must redirect cache:
  ```
  $env:npm_config_cache="E:\npm-cache"; npm <command> --legacy-peer-deps
  ```
  Missing either the cache redirect or `--legacy-peer-deps` will fail.

- **Working directory** for all app commands: `e:\FEST\V1\fest-app`

## Commands

| Action | Command |
|--------|---------|
| Install | `$env:npm_config_cache="E:\npm-cache"; npm install --legacy-peer-deps` |
| Dev (web) | `npx expo start --web` → http://localhost:8081 |
| Dev (mobile) | `npx expo start` |
| Type check | `npx tsc --noEmit` |
| Smoke build | `npx expo export --platform web` |

No `npm test` script exists. No linter is configured — use `tsc --noEmit` as the verification gate. Always run it after code changes.

## Architecture

Single-package Expo + React Native + TypeScript app. No monorepo, no backend (mock-only Zustand state), no native builds.

### Navigation

- **RootStack**: MainTabs + Notifications overlay
- **MainTabs** (5 bottom tabs): HomeTab → HomeStack, SearchTab (standalone), CreateTab (standalone), PlansTab → PlansStack, ProfileTab (standalone)
- **HomeStack**: HomeFeed → EventDetails → CreatePlanFromEvent / VenueDetails
- **PlansStack**: PlansList → PlanDetails / GroupDetails
- **Cross-tab navigation**: must use `(navigation as any).navigate('TabName', { screen: 'ScreenName', params })` — `CompositeNavigationProp` typing is unreliable with Expo SDK 54 + React Navigation 7. Do not attempt to type this tighter.

### Key files

| File | Why it matters |
|------|---------------|
| `src/types/index.ts` | All entity types + `ACTIVITY_LABELS` constant |
| `src/theme/index.ts` | Design tokens. `theme.spacing` is Platform-adapted (web ≈15% tighter). Use `theme.spacing.*` everywhere, never hardcode. |
| `src/mocks/index.ts` | All mock data. User `id: 'me'` (index 5) is the logged-in user. Plans p1/p2 active, p3 completed. |
| `src/navigation/types.ts` | Route param types for all 3 navigators |
| `src/components/ScreenContainer.tsx` | `maxWidth: 600` + centered on web, transparent on mobile. Every screen must be wrapped in this. |
| `docs/ProductPlan.md` | Canonical product spec — overrides any other doc or assumption |

### Zustand stores (6)

`authStore`, `eventsStore`, `plansStore`, `groupsStore`, `notificationsStore`, `invitationsStore`

Cross-store access uses `OtherStore.getState()` — used in `invitationsStore` → `plansStore` + `authStore`.

### Plan lifecycle

`active → finalized → completed`. Cancel from `active` or `finalized`. "Повторить" on completed creates a new active plan with same participants.

## Product constraints

- **Canonical spec**: `docs/ProductPlan.md` — source of truth for all product rules
- **Russian UI only** — all user-facing strings in Russian
- **No features beyond MVP** — no group chat, map, calendar entity, email auth, venue admin, event creation
- **Plan is `active` on creation** — no draft/invited state at plan level
- **Max 15 participants per plan**
- **Chat is inside PlanDetails only** — no standalone chat
- **Pre-meet** = simple text fields, no voting
- **9 notification types** including `group_invite`

## Web layout conventions

- `ScreenContainer` wraps every screen (maxWidth 600, centered on web)
- `theme.spacing` is already Platform-adapted — always use it, never hardcode
- Image/hero heights: `Platform.select({ web: smaller, default: larger })` + `aspectRatio` on web
- Tab bar: maxWidth 600 on web
- Auth form: separate maxWidth 400 on web

## Gotchas

- `Set<string>` in Zustand state (`interestedIds`, `savedIds`) is not serializable — breaks with persistence, fine for mock-only
- `PlanParticipant.user` is `User | undefined` but `authStore.user` is `User | null` — bridge with `?? undefined`
- Date utils (`dates.ts`) accept `null | undefined` and return `''` — safe to call with any nullable date field
- `CreatePlanForm` returns `planId` via `onDone` callback, not via navigation params
- Expo SDK 54 peer dep conflicts — always `--legacy-peer-deps`
- `package.json` has no `"test"` script — `npm test` errors, not just no-op
