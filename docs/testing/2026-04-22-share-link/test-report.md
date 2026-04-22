# Test Report — P1 Plan Share + Deep Link (PR #2)

**Session**: https://app.devin.ai/sessions/9abdd80a796b4e5db52ac52c7d1ab56a
**PR**: https://github.com/magtophard-ai/Plans/pull/2
**Recording**: https://app.devin.ai/attachments/8e522244-5521-46d1-bac7-858b1228f764/rec-392e86d1-60e7-4d16-a2a9-f2c550e477ac-edited.mp4

## Escalations

- **Regression fix re-applied on this branch**: `client.ts` always set `Content-Type: application/json`, breaking every bodyless POST (incl. `/by-token/:token/join`) with Fastify error "Body cannot be empty when content-type is set to 'application/json'". The same fix exists on PR #1's branch (commit `015e7de`) but PR #1 isn't merged yet, so I re-applied it here in commit `66448ee` (`fix(api): skip Content-Type for bodyless requests`). Re-run after the fix passes all assertions.
- **Migration ordering bug found and fixed** in commit `3fbca1a`: `CREATE INDEX idx_plans_share_token` in `001_init.sql` runs before any idempotent `ALTER TABLE ADD COLUMN` when re-applying on existing DBs. Fix: run `ALTER TABLE plans ADD COLUMN IF NOT EXISTS share_token text` before the main init.sql loop. Verified: `npm run db:migrate` now succeeds; `share_token` populated for all 3 seed plans.

## Results

| Test | Result |
|---|---|
| Share button copies URL to clipboard | passed |
| Unauth deep link renders AuthScreen + stashes token + public GET works | passed |
| Login as Artem auto-navigates to PublicPlan | passed |
| Join: participant added + creator gets `plan_join_via_link` notification | passed (after fix) |
| Re-join is idempotent: no duplicate row, no duplicate notification | passed |

## Evidence

### PublicPlan preview after OTP (Test 3)

![PublicPlan after login](https://app.devin.ai/attachments/86c13883-25f2-42ba-bae5-9e1e27d6db6f/screenshot_5acf5dc1c6004d5d8aa0c59b116dd9b4.png)

- URL: `http://localhost:8081/p/bcf69309791cf210`
- Tab title: `PublicPlan`
- Renders title "Кино в субботу", activity "Кино", counter "3/15", creator "от Я @me", "Присоединиться" button.

### PlanDetails after Join (Test 4)

![PlanDetails with Артём added](https://app.devin.ai/attachments/da955f52-502c-458f-9596-5f5dc140a548/screenshot_a35144fd98bb4057b8ab6bcf917d1daf.png)

- URL: `http://localhost:8081/plans/PlanDetails?planId=72222222-2222-4222-8222-222222222222`
- Header: "4 участников · Активный"
- Participants list includes "Артём — Иду"

### DB + Notification assertions

```sql
-- plan_participants for this plan:
 name  | status
-------+---------
 Я     | going
 Маша  | going
 Дима  | invited
 Артём | going    -- NEW
(4 rows)

-- notifications of type plan_join_via_link:
 recipient | type                | joiner
-----------+---------------------+--------
 Я         | plan_join_via_link  | Артём  -- exactly 1 row
```

### Public GET (no auth header)

```
$ curl -s -w "\nHTTP %{http_code}\n" http://localhost:3001/api/plans/by-token/bcf69309791cf210
{"plan":{"id":"72222222-...","title":"Кино в субботу","activity_type":"cinema",
  "lifecycle_state":"active","share_token":"bcf69309791cf210",
  "creator":{"id":"25b7c99d-...","name":"Я","username":"me",...},
  "participant_count":3,"max_participants":15}}
HTTP 200
```

### localStorage stash on unauth deep link

```
window.localStorage.getItem('fest_pending_join_token')
→ "bcf69309791cf210"
```

### Clipboard capture from Share button

```
window.__capturedClip
→ ["http://localhost:8081/p/bcf69309791cf210",
   "http://localhost:8081/p/bcf69309791cf210"]
```

### Idempotent re-Join

- Second click on "Присоединиться" from the same `/p/bcf69309791cf210` session: UI returns to PlanDetails with count **still 4**.
- DB: `plan_participants` row count for the plan = **4**, `notifications` of type `plan_join_via_link` = **1**. No duplicate.

## Out of scope (not tested, documented in PR)

- `PLAN_FULL` (15+ participants) — code path exists (`count >= 15 → 409`).
- `fest://` URL scheme on native — web flow proves the linking config; native schemes need EAS build.
- Universal Links / OG preview — PR description explicitly defers.
