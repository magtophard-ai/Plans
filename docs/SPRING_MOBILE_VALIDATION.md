# Spring mobile validation

Date/time: 2026-04-27 14:21 UTC

Branch: `devin/1777296529-spring-mobile-validation`
Base commit: `9b31a27` (`master`, PR #15 merged)

## Scope

This validation ran the Expo frontend against Spring during PR #16. Spring is now the current canonical backend; Fastify remains in `backend/` as archived legacy code for history, rollback drills, and legacy parity audits only.

The validation PR did not remove Fastify, did not disable Fastify CI jobs, and did not change production DB migration/baseline strategy.

## Runtime setup

### Postgres 17

```bash
docker run -d --name fest-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=plans \
  -p 5432:5432 \
  postgres:17
```

If already present:

```bash
docker start fest-pg
```

### Spring backend

```bash
cd backend-spring
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/plans
export JWT_SECRET=dev-secret
export OTP_CODE=1111
export PORT=3001
./gradlew bootRun
```

Manual dev seed:

```bash
psql postgres://postgres:postgres@localhost:5432/plans \
  -f backend-spring/src/main/resources/db/seed/R__dev_seed.sql
```

Health check:

```bash
curl http://localhost:3001/api/health
```

Result: `{"status":"ok"}`.

### Public backend tunnel

Tool: `cloudflared`

```bash
cloudflared tunnel --url http://localhost:3001
```

Validation URL used during this run:

```text
https://cool-framework-boring-networking.trycloudflare.com
```

This is an ephemeral Cloudflare quick tunnel URL, not a permanent dependency.

Public checks:

```bash
curl https://cool-framework-boring-networking.trycloudflare.com/api/health
curl -X POST "https://cool-framework-boring-networking.trycloudflare.com/api/auth/otp/send" \
  -H "content-type: application/json" \
  -d '{"phone":"+79990000000"}'
curl -X POST "https://cool-framework-boring-networking.trycloudflare.com/api/auth/otp/verify" \
  -H "content-type: application/json" \
  -d '{"phone":"+79990000000","code":"1111"}'
```

Result: health/auth/events succeeded after adding Spring CORS support.

### Expo frontend

```bash
cd fest-app
npm install --legacy-peer-deps
export BACKEND_PUBLIC_URL=https://cool-framework-boring-networking.trycloudflare.com
export EXPO_PUBLIC_API_BASE_URL="$BACKEND_PUBLIC_URL/api"
export EXPO_PUBLIC_WS_BASE_URL="wss://${BACKEND_PUBLIC_URL#https://}/api/ws"
npx expo start --tunnel --go --clear
```

The Expo Go tunnel command failed in this VM with an Expo/ngrok CLI runtime error:

```text
Cannot read properties of undefined (reading 'body')
```

Fallback used for validation:

```bash
npx expo start --web --clear
cloudflared tunnel --url http://localhost:8081
```

Public Expo web URL used during this run:

```text
https://travelers-commentary-quarters-mary.trycloudflare.com
```

Bundle env verification:

```bash
curl -s 'http://localhost:8081/index.ts.bundle?platform=ios&dev=true&hot=false' \
  -o /tmp/bundle.js
grep -c 'trycloudflare.com' /tmp/bundle.js
```

Result: `1`.

Test credentials:

- Phone: `+79990000000`
- OTP: `1111`

## Checklist results

| # | Flow | Result | Notes |
|---|---|---|---|
| 1 | App opens without runtime crash | Pass | Expo web fallback loaded from public tunnel. |
| 2 | Onboarding/auth screen opens | Pass | Auth screen rendered after CORS fix. |
| 3 | Login with `+79990000000` / `1111` | Pass | OTP send/verify succeeded against Spring public URL. |
| 4 | Feed/events list loads from Spring | Pass | Seeded event list loaded. |
| 5 | Event detail opens | Pass | Seeded event detail rendered. |
| 6 | User profile/me data loads | Pass | Profile tab rendered current user `@me`. |
| 7 | Create plan from generic flow or event detail | Pass | Event plan creation initially failed on `confirmed_time`; fixed and retested. Generic plan creation also passed. |
| 8 | Add/invite participant | Pass with empty-state | Invite sheet opened and handled no eligible friends. |
| 9 | Open plan detail | Pass | Newly created plans opened in detail view. |
| 10 | Create place proposal | Pass | Place proposal created on generic plan. |
| 11 | Create time proposal with valid `value_datetime` | Pass | ISO datetime `2026-04-28T18:00:00.000Z` accepted. |
| 12 | Vote/unvote proposal | Pass | Vote toggle executed on proposal card. |
| 13 | Finalize plan | Pass | Confirmed event plan finalized; proposal selection path also finalized. |
| 14 | Unfinalize plan | Pass | Finalized plan returned to active state. |
| 15 | Send plan message | Pass | Chat message posted. |
| 16 | Check message appears | Pass | Message appeared without page refresh. |
| 17 | Realtime update without refresh | Partial | Same-session UI updated after REST actions; Spring `realtimeSmokeTest` remains the stronger two-client coverage. No two-device Expo Go test was available because Expo tunnel failed. |
| 18 | Complete plan | Pass after fix | Finalized plan screen initially did not expose complete; fixed and retested. |
| 19 | Repeat completed plan | Pass | Completed plan repeated into a new active plan. |
| 20 | Notifications list/read | Pass | Notifications list loaded and `mark all read` worked. |
| 21 | Share link preview/join | Pass | `/p/<share_token>` preview loaded and join routed to plan detail. |
| 22 | Content-related flow | Pass | Spring-seeded events list/detail loaded; content ops smoke is covered by `contentOpsSmokeTest`. |

## Bugs found and fixed

### 1. Spring CORS preflight rejected public Expo web origin

Symptom: browser OTP send failed with HTTP 403 `Invalid CORS request`.

Fix: configured Spring MVC CORS for `/api/**` and added a regression test for auth preflight.

### 2. Event plan creation sent formatted text as `confirmed_time`

Symptom: plan creation from event failed because the frontend sent a display string such as `27 апр` while Spring expects a valid datetime.

Fix: event-linked create flow now keeps the display label for UI but submits the source event ISO datetime.

### 3. Finalized plan could not be completed from UI

Symptom: after finalization, the detail screen exposed unfinalize/cancel but not complete, blocking complete/repeat validation even though the backend supports completion of finalized plans.

Fix: show `Завершить план` for finalized plans and retested complete/repeat.

## Known limitations

- Expo Go native tunnel was not validated because `npx expo start --tunnel --go --clear` failed inside the VM with the Expo/ngrok CLI error above.
- Validation used Expo web via public `cloudflared` tunnel as the available test app flow.
- Realtime was manually observed as same-session UI refresh after actions; full two-client realtime coverage should rely on `backend-spring` realtime smoke and/or a later real-device Expo Go pass.
- The Cloudflare tunnel URLs are ephemeral and should not be stored as permanent dependencies.

## Archived Fastify rollback path

1. Stop Spring.
2. Start archived legacy Fastify from `backend/` only for an explicit rollback drill.
3. Point `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_WS_BASE_URL` to the legacy Fastify local/public backend URL.
4. Keep Fastify CI jobs enabled as archived legacy checks while the archive remains in the repo.

## Recommendation

Spring passed the available Expo web validation flow after the contract/runtime fixes above. Spring is now the current canonical backend; rerun the same checklist on a real device when strict native Expo Go validation is needed for release readiness.
