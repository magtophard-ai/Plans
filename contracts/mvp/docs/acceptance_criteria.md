# MVP Acceptance Criteria — Планы?

Per-screen and per-flow acceptance criteria for the real-backend MVP.
All criteria assume authenticated user (phone OTP).

---

## Auth

- [ ] User can enter a phone number and receive an OTP
- [ ] User can submit the OTP and receive access + refresh tokens
- [ ] Invalid OTP returns 401 with clear error
- [ ] Rate limit on OTP send (max 1 per 60s per phone)
- [ ] Refresh token returns new token pair
- [ ] Expired access token returns 401; client refreshes transparently

## Home Feed

- [ ] Events load chronologically (starts_at DESC) with pagination (20 per page)
- [ ] Each event card shows: cover image, title, venue name, date, social proof (friends interested, friends plan count)
- [ ] Category filter returns filtered results
- [ ] Toggling interest updates immediately in UI; syncs to server
- [ ] Toggling save updates immediately in UI; syncs to server
- [ ] If server rejects interest/save, UI rolls back
- [ ] Empty feed shows "Нет мероприятий" state
- [ ] "Планы?" CTA navigates to CreatePlanFromEvent with correct eventId

## Event Details

- [ ] Full event loads: cover, title, description, venue, time, price, category
- [ ] Social proof shows friends interested by name
- [ ] Venue link navigates to VenueScreen
- [ ] Interest and save toggles work (same as home feed)
- [ ] "Планы?" CTA navigates to CreatePlanFromEvent

## Create Plan from Event

- [ ] Event title, venue, time are prefilled and read-only
- [ ] Friend list loads from /users/friends
- [ ] Group list loads from /groups
- [ ] Selecting a group pre-selects its members
- [ ] Creating plan returns 201 with full plan object
- [ ] Plan is immediately visible in Plans Hub (active)
- [ ] Creator appears as participant with status=going
- [ ] Each selected friend appears as participant with status=invited
- [ ] Each invited friend receives a plan_invite notification
- [ ] Linked event data is anchored (read-only in plan)

## Generic Create Plan

- [ ] Activity type picker shows all 8 types with Russian labels
- [ ] Title, place, time are editable free-text fields
- [ ] Pre-meet toggle reveals place/time fields
- [ ] Friend/group selection same as event-linked flow
- [ ] Plan created as active with correct statuses
- [ ] If place or time provided, corresponding status = confirmed; otherwise undecided

## Plan Details — Details Tab

- [ ] Plan loads with participants, proposals, linked event
- [ ] Participants show name + status badge (color-coded)
- [ ] User can set own status (going/thinking/cant) — server-confirmed
- [ ] "Предложить место/время" button creates proposal via POST
- [ ] Proposal appears in both details tab and chat (proposal_card message)
- [ ] Other participants receive proposal_created notification
- [ ] Place/time status changes from undecided → proposed when first proposal added
- [ ] Voting: tap to vote, tap again to unvote — optimistic
- [ ] Max 2 votes per type per user — 409 on exceed, UI rolls back
- [ ] Creator can finalize by selecting place + time proposal
- [ ] Finalize: lifecycle → finalized, confirmed data set, losing proposals → superseded, all get plan_finalized notification
- [ ] Creator can unfinalize: lifecycle → active, superseded proposals → active, plan_unfinalized notification sent
- [ ] Creator can cancel: lifecycle → cancelled
- [ ] Only creator sees finalize/unfinalize/cancel buttons

## Plan Details — Chat Tab

- [ ] Messages load in chronological order
- [ ] User messages show sender name + text
- [ ] System messages have distinct styling (left border)
- [ ] Proposal cards show "📋 Предложение" text
- [ ] Sending a message appends optimistically; on failure, marked as failed
- [ ] Pagination: scroll up loads older messages via ?before cursor

## Invitations

- [ ] Pending invitations load in Plans Hub Приглашения section
- [ ] Each invitation shows: plan/group title, inviter context
- [ ] Accept (plan): creates participant (status=going), creates system message, invitation status → accepted
- [ ] Accept (group): creates group_member, invitation status → accepted
- [ ] Decline: invitation status → declined, no side-effects
- [ ] After accept, plan appears in Active plans
- [ ] Accept/decline are server-confirmed

## Plans Hub

- [ ] Active tab shows plans with lifecycle active|finalized where user is participant
- [ ] Past tab shows plans with lifecycle completed
- [ ] Invitations tab shows pending invitations
- [ ] Groups tab shows user's groups with member count
- [ ] Plan cards show: title, status badge, participant count, confirmed time (if any)
- [ ] Tapping a plan navigates to PlanDetails
- [ ] Tapping a group navigates to GroupDetails

## Repeat Flow

- [ ] Completed plan shows "Повторить" button
- [ ] POST /plans/{id}/repeat creates new plan with:
  - Same title, activity_type
  - Same participants (status=invited for non-creator)
  - Creator as going
  - place_status=undecided, time_status=undecided
  - No proposals carried over
- [ ] New invitations + notifications created
- [ ] Navigates to new plan's details

## Search

- [ ] Text search matches event title, venue name, tags
- [ ] Category filter works
- [ ] Results show cover, title, venue, date
- [ ] Tapping result navigates to EventDetails
- [ ] Empty results show "Ничего не найдено"

## Venue Screen

- [ ] Venue loads with name, address, description, cover
- [ ] Event list shows upcoming events at this venue
- [ ] Tapping an event navigates to EventDetails
- [ ] No upcoming events shows empty state

## Profile

- [ ] Shows user name, username, avatar initial
- [ ] "Сохранённые" shows saved events list
- [ ] Logout clears tokens, returns to AuthScreen
- [ ] No "Скоро" or non-functional menu items

## Cross-cutting

- [ ] All endpoints require valid JWT except /auth/otp/send and /auth/otp/verify
- [ ] Creator-only actions return 403 for non-creators
- [ ] Max 15 participants enforced (server rejects 16th)
- [ ] Max 2 votes per type per user per plan enforced (409)
- [ ] All user-facing text is in Russian
- [ ] Network errors show retryable state, not silent failures
