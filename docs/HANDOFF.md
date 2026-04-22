# Session Handoff — 2026-04-22

This document is the handoff from Devin session
[`9abdd80a796b4e5db52ac52c7d1ab56a`](https://app.devin.ai/sessions/9abdd80a796b4e5db52ac52c7d1ab56a)
to the next agent picking up work on this repo. It captures **what was
delivered in this session, what is next, and the gotchas you will hit if
you try to reproduce the environment from a fresh fork**. Read it before
touching anything.

---

## TL;DR

- **Delivered & merged**: PR #1 (friends pending/accept flow + `friend_request` notifications) and PR #2 (plan share link + `fest://p/:token` deep link).
- **Open**: PR #3 (in-memory fallback for `pendingJoin` on React Native — fixes a silent breakage on mobile found by Devin Review after PR #2 was merged).
- **Agreed but not yet coded**: P2 in the roadmap below — onboarding screen (before AuthScreen, flag stored in pendingJoin-style storage) + upgraded empty-state components across ~10 call sites. Scope is frozen; see §4.
- **Roadmap position**: P0a (friends) ✅, P0b (real OTP) — explicitly skipped by user ("пока не хочу заниматься провайдерами"), P1 (share link) ✅, P2 (onboarding + empty states) ← next.

---

## 1. What was delivered in this session

### PR #1 — Friends pending / accept flow
- URL: <https://github.com/magtophard-ai/Plans/pull/1> (merged)
- Branch: `devin/1776863429-friends-and-profile` (can be deleted)
- Backend: `POST /users/friends/:id` now writes `pending` (not auto-accepted); new `PATCH /users/friends/:id` with `{action: accept|decline}`; mutual-POST auto-accepts; `GET /users/friends` supports `direction=incoming|outgoing` and attaches `friendship_status` to each row. Added `friend_request` to the `notification_type` enum via idempotent `ALTER TYPE … ADD VALUE IF NOT EXISTS` in `backend/src/db/migrate.ts`.
- Frontend: `friendsStore` gained `incomingRequests`/`outgoingRequests`/`acceptFriendRequest`/`declineFriendRequest`. `PublicProfileScreen` renders the four `friendship_status` states. `ProfileScreen` friends drawer shows "Входящие заявки" + pink badge on the menu item. `NotificationsScreen` + `types.NotificationType` handle `friend_request`.
- Also included a collateral fix: `fest-app/src/api/client.ts` no longer sets `Content-Type: application/json` on bodyless POSTs (Fastify rejected them with "Body cannot be empty…").
- E2E tested in session (two-browser Masha/Артём, psql spot-checks). Test artifacts are at `test-plan.md` and `test-report.md` (repo root) — see §6 about whether to keep those.

### PR #2 — Plan share link + deep link
- URL: <https://github.com/magtophard-ai/Plans/pull/2> (merged)
- Branch: `devin/1776870581-plan-share-link` (can be deleted)
- Backend: `plans.share_token` column (8-byte hex, unique, auto-generated on `POST /plans` and `/plans/:id/repeat`); public `GET /api/plans/by-token/:token` (no auth, minimal preview); authed `POST /api/plans/by-token/:token/join` with `SELECT … FOR UPDATE`, idempotent on repeat, 409 on cancelled/completed/full. Added `plan_join_via_link` enum value via the same pattern as PR #1.
- Frontend: `expo.scheme = "fest"` in `app.json`; `NavigationContainer` linking config routes `fest://p/:token` / `http(s)://<host>/p/:token` → new `PublicPlanScreen`. `PlanDetailsScreen` gains a "Поделиться" button (Web Share API → clipboard fallback → native `Share.share`). `usePendingJoinCapture` stashes tokens from deep links seen while logged-out; after OTP, `NavigationContainer.onReady` auto-navigates to `PublicPlan`.
- Migration ordering fix: `ALTER TABLE plans ADD COLUMN IF NOT EXISTS share_token` now runs **before** init.sql so `CREATE INDEX idx_plans_share_token` doesn't fail on existing DBs.
- Test artifacts: `docs/testing/2026-04-22-share-link/`.

### PR #3 — pendingJoin native fallback (OPEN)
- URL: <https://github.com/magtophard-ai/Plans/pull/3>
- Branch: `devin/1776873215-pendingjoin-native-fallback`
- Fix for a Devin Review finding on merged PR #2: `fest-app/src/utils/pendingJoin.ts` used `localStorage` with a `typeof localStorage === 'undefined'` guard, silently no-opping on iOS/Android. Added a module-level in-memory mirror so the token survives the OTP window on native. Web behavior unchanged (`localStorage` remains the primary store).
- Only the `pendingJoin.ts` file changes. Typecheck green.
- **Still needs user to merge.**

---

## 2. Roadmap agreed with user

Order and reasoning are the user's own choices from earlier in the session — don't reorder silently.

| # | Item | Status |
|---|------|--------|
| P0a | Friends pending/accept flow + pickers | ✅ merged (PR #1) |
| P0b | Real SMS OTP provider | ⏭ **explicitly skipped** by the user — keep `OTP_MOCK=true` / code `1111` until they ask |
| P1 | Plan share link + deep link | ✅ merged (PR #2) + hotfix pending (PR #3) |
| P2 | Onboarding + human empty states | 🟡 scope agreed, branch created, not yet coded — see §4 |
| P3 | Sentry + minimal PostHog analytics | pending |
| P4 | Dark theme (respecting Aurora) | pending |
| P5 | Basic integration tests (friends-flow, plan lifecycle, invitations, WS) | pending |
| P6 | Mobile native check + EAS build (dev + preview) | pending |
| P7 | Push notifications (`plan_invite`, `friend_request`, `plan_finalized`) | pending — only meaningful **after** P1 + P2 are live |
| P8 | Backfill WS events (`plan.cancelled`, `plan.completed`, participant.*), wire `PATCH /users/me`, add ESLint | pending |

---

## 3. Current open PRs / branches

| Branch | Purpose | State |
|--------|---------|-------|
| `master` | Production trunk | PR #1 and PR #2 merged |
| `devin/1776873215-pendingjoin-native-fallback` | PR #3 (native fallback) | open, awaiting merge |
| `devin/1776872837-onboarding-empty-states` | P2 work branch (empty — only contains the base master state) | safe to delete and recreate from fresh master |
| `devin/1776863429-friends-and-profile` | PR #1 (merged) | can be deleted |
| `devin/1776870581-plan-share-link` | PR #2 (merged) | can be deleted |

---

## 4. P2 — scope agreed with user

The user picked option **"До AuthScreen (продать идею до формы)"**. Do not change this without asking.

### Onboarding
- New `OnboardingScreen` with **3 swipeable slides** (pager):
  1. "Собирайтесь с друзьями" — core value prop
  2. "Предложения и голосования" — place/time proposals
  3. "Делитесь ссылкой" — P1 share link feature
- Aurora background + FadeIn/SplitText already in the theme; reuse them, don't add new motion components.
- **Gate**: show on first launch only. Store a boolean flag (same cross-platform pattern as `pendingJoin.ts` after PR #3 — `localStorage` on web, module-level or `AsyncStorage` on native. For a one-time flag `AsyncStorage` is appropriate since we want it to survive app kills; for the in-session token, in-memory is fine).
- "Пропустить" (top-right, muted) and "Далее"/"Начать" (primary CTA). On completion → set the flag → render `AuthScreen`.

### Empty states
- Upgrade `fest-app/src/components/EmptyState.tsx` from `{ text }` only → `{ icon?, title, body?, cta? }` where `cta = { label, onPress }`.
- Update ~10 call sites with context-aware copy (full list below). Don't add external assets; stick to emojis inside the existing circle.

| File | Existing text | New copy (approved) |
|------|---------------|---------------------|
| `PlansHubScreen.tsx` · Активные | "Нет активных планов" | 🎬 "Пока ничего не запланировано" + "Найдите событие на Главной или создайте свой план" + CTA "Создать план" |
| `PlansHubScreen.tsx` · Приглашения | "Нет приглашений" | 📨 "Входящих приглашений нет" + "Друзья позовут — тут появятся" |
| `PlansHubScreen.tsx` · Группы | "Нет групп" | 👥 "Групп пока нет" + "Группы помогают собирать компанию под одно событие" |
| `PlansHubScreen.tsx` · Прошедшие | "Нет прошедших планов" | 🕰 "История пустая" + "Сюда попадут завершённые планы" |
| `NotificationsScreen.tsx` | "Нет уведомлений" | 🔔 "Пока тихо" + "Когда друзья позовут или что-то изменится — сообщим" |
| `ProfileScreen.tsx` · Сохранённые | "Ничего не сохранено" | ⭐ "Нет сохранённых" + "Тапните ☆ на карточке события, чтобы вернуться позже" |
| `ProfileScreen.tsx` · Друзья (пусто) | "Нет друзей — попробуйте найти кого-то выше" | 🤝 "Пока один" + "Найдите друзей в поиске выше" |
| `SearchScreen.tsx` (пустой запрос) | (ничего) | 🔍 "Что ищете?" + "Пробуйте названия мест или категории" |
| `SearchScreen.tsx` (нет результатов) | "Ничего не найдено" | 🫥 "Ничего не нашлось" + "Попробуйте другой запрос" |
| `HomeScreen.tsx` (пустая категория) | (пустой список) | 🎯 "Нет событий в этой категории" + CTA "Сбросить фильтр" |

Leave `CreatePlanForm.tsx`'s inline `Нет друзей — можно создать план только для себя` as-is (it's a form hint, not a full-screen empty state).

### Out of scope for P2
- Lottie illustrations (emojis are fine for MVP).
- Dark-mode variants of empty states (tackle in P4).
- A/B testing copy (needs PostHog from P3 first).

---

## 5. Gotchas found during this session (read before restarting env)

1. **`backend/src/db/migrate.ts` ordering**: `001_init.sql` contains `CREATE INDEX idx_plans_share_token` on a column that's added by a later `ALTER TABLE`. The fix in PR #2 runs the `ALTER TABLE … ADD COLUMN IF NOT EXISTS share_token` **before** the main init.sql loop. If you see `column "share_token" does not exist` (`42703`) during `npm run db:migrate`, it means someone reordered this.
2. **`fest-app/src/api/client.ts`** must NOT set `Content-Type: application/json` when `body === undefined`. Fastify 400s any declared-JSON request with an empty body (e.g. `POST /api/plans/by-token/:token/join`). This fix exists on master via PR #1 — don't revert it.
3. **`pendingJoin.ts` on native**: PR #3 must land, or the mobile deep-link flow silently fails (user ends up on `MainTabs` after OTP instead of `PublicPlanScreen`). Verify `setPendingJoinToken` has an in-memory mirror before building any new feature that depends on pre-auth state.
4. **Environment**: Postgres runs in docker container `fest-pg` (`postgres:postgres`, db `plans`). Backend default `:3001`, Expo web `:8081`. OTP code is always `1111` (`OTP_MOCK`), no real SMS provider — user explicitly deferred P0b.
5. **Seed users** for E2E (created by `backend/src/db/seed.ts`):
   - `+79990000000` → "Я" (`@me`) — creator of plan "Кино в субботу"
   - `+79994444444` → "Артём" (`@artem`)
   - `+79991111111` → "Маша"
   - Plan `72222222-2222-4222-8222-222222222222` has `share_token=bcf69309791cf210`.

---

## 6. Test artifacts

- `docs/testing/2026-04-22-share-link/test-plan.md` — 5-case test plan for PR #2 (share → unauth deep link → OTP → join → idempotent rejoin).
- `docs/testing/2026-04-22-share-link/test-report.md` — executed report with assertions, DB dumps, and recording link.
- Recording for PR #1 (friends flow): posted inline in the PR #1 comment thread.
- Recording for PR #2 (share flow): posted inline in the PR #2 comment thread.

If you need to rerun E2E: see `docs/RUNBOOK.md` for backend/Expo startup, then follow the relevant test plan. Two browser windows (A = Masha or `@me`, B = Артём) work well on Expo web.

---

## 7. How to resume (concrete next steps for the next agent)

1. Ensure PR #3 (<https://github.com/magtophard-ai/Plans/pull/3>) is merged. If it isn't, merge it first — otherwise any P2 work that touches auth flow will be tested on broken native code.
2. Check out fresh master: `git fetch && git checkout master && git pull`.
3. Delete or re-create the abandoned P2 branch: `git branch -D devin/1776872837-onboarding-empty-states` (it has no commits; the P2 scope in §4 is the source of truth).
4. Create a new branch for P2 work, e.g. `devin/<timestamp>-onboarding-empty-states`.
5. Start with the `EmptyState` component upgrade + one call site (e.g. `NotificationsScreen.tsx`) as a sanity check on the new API. Then roll through the remaining ~9 call sites.
6. Onboarding: put `OnboardingScreen` and a `useOnboardingGate` hook (mirrors the PR #3 pattern: localStorage on web, AsyncStorage on native — this one DOES need AsyncStorage because it must persist across app kills, unlike pendingJoin which only needs the OTP window). Render `<OnboardingScreen />` instead of `<AuthScreen />` from the existing `!isAuthenticated` branch in `App.tsx` when the flag is absent.
7. Before opening the PR, run `npx tsc --noEmit` in both `backend/` and `fest-app/` (main quality gate; `fest-animations` is excluded from this gate per `tsconfig.json`).
8. Open PR against master. The repo has no CI workflows — don't wait for checks that don't exist. Link `docs/HANDOFF.md` so reviewers can trace context.

---

## 8. Stuff the user did NOT ask for (do not do unless asked)

- Do not set up a real SMS provider (P0b is explicitly deferred).
- Do not bypass `AGENTS.md` / `CLAUDE.md` style conventions.
- Do not force-push to master or amend commits.
- Do not create new motion components; reuse `Aurora`, `FadeIn`, `Stagger`, `Tilt`, `Pressable`, `SplitText`, `TabIndicator`, `Tab`, `Badge`, `NotificationBell` from `fest-app/src/motion`.
