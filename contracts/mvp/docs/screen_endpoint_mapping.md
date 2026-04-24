# Screen-to-Endpoint Mapping — MVP

Source of truth: `contracts/mvp/api/openapi.yaml`

---

## AuthScreen

| Action | Method | Endpoint | Optimistic | Server-confirmed |
|---|---|---|---|---|
| Send OTP | POST | /auth/otp/send | — | yes |
| Verify OTP | POST | /auth/otp/verify | — | yes |
| Logout | client-side token discard | — | — | — |

---

## HomeScreen

| Action | Method | Endpoint | Optimistic | Server-confirmed |
|---|---|---|---|---|
| Load event feed | GET | /events?limit=20&page=1 | — | — |
| Filter by category | GET | /events?category=music | — | — |
| Toggle interest | POST/DELETE | /events/{id}/interest | yes (rollback on error) | — |
| Toggle save | POST/DELETE | /events/{id}/save | yes (rollback on error) | — |
| Navigate to event details | — | — | — | — |
| Navigate to create plan from event | — | — | — | — |
| Navigate to notifications | — | — | — | — |

**Social proof** comes embedded in `EventWithSocial.friends_interested` and `EventWithSocial.friends_plan_count` from `GET /events`.

---

## EventDetailsScreen

| Action | Method | Endpoint | Optimistic | Server-confirmed |
|---|---|---|---|---|
| Load event | GET | /events/{id} | — | — |
| Toggle interest | POST/DELETE | /events/{id}/interest | yes | — |
| Toggle save | POST/DELETE | /events/{id}/save | yes | — |
| Navigate to create plan from event | — | — | — | — |
| Navigate to venue | GET | /venues/{id} | — | — |

---

## SearchScreen

| Action | Method | Endpoint | Optimistic | Server-confirmed |
|---|---|---|---|---|
| Search events | GET | /search/events?q=...&category=...&date_from=...&date_to=... | — | — |
| Navigate to event details | — | — | — | — |

Date filters (today/week/weekend) are converted to `date_from`/`date_to` query params.

---

## VenueScreen

| Action | Method | Endpoint | Optimistic | Server-confirmed |
|---|---|---|---|---|
| Load venue | GET | /venues/{id} | — | — |
| Load venue events | GET | /venues/{id}/events | — | — |
| Navigate to event details | — | — | — | — |

---

## CreatePlanScreen (generic)

| Action | Method | Endpoint | Optimistic | Server-confirmed |
|---|---|---|---|---|
| Load friends | GET | /users/friends?status=accepted | — | — |
| Load groups | GET | /groups | — | — |
| Create plan | POST | /plans | — | yes (atomic: plan + participants + invitations + notifications + system message) |

`POST /plans` creates the plan, adds creator as `going` participant, adds each `participant_ids` entry as `invited` participant, creates invitations, and sends `plan_invite` notifications — all in one transaction.

---

## CreatePlanFromEventScreen

| Action | Method | Endpoint | Optimistic | Server-confirmed |
|---|---|---|---|---|
| Load event (for prefill) | GET | /events/{id} | — | — |
| Load friends | GET | /users/friends?status=accepted | — | — |
| Load groups | GET | /groups | — | — |
| Create plan with linked event | POST | /plans (with linked_event_id) | — | yes |

---

## PlansHubScreen

| Action | Method | Endpoint | Optimistic | Server-confirmed |
|---|---|---|---|---|
| Load active plans | GET | /plans?lifecycle=active&lifecycle=finalized&participant=me | — | — |
| Load past plans | GET | /plans?lifecycle=completed&participant=me | — | — |
| Load invitations | GET | /invitations?status=pending | — | — |
| Load groups | GET | /groups | — | — |
| Accept invitation | PATCH | /invitations/{id} {status: accepted} | — | yes (side-effect: creates participant + system message server-side; frontend re-fetches plan) |
| Decline invitation | PATCH | /invitations/{id} {status: declined} | — | yes |
| Open plan | navigate | PlanDetails with planId | — | — |
| Open group | navigate | GroupDetails with groupId | — | — |

---

## PlanDetailsScreen — Details Tab

| Action | Method | Endpoint | Optimistic | Server-confirmed |
|---|---|---|---|---|
| Load plan | GET | /plans/{id} | — | — |
| Update own status | PATCH | /plans/{id}/participants/{uid} {status: going/thinking/cant} | — | yes |
| Invite participant | POST | /plans/{id}/participants {user_id} | — | yes (side-effect: creates invitation + notification) |
| Propose place/time | POST | /plans/{id}/proposals | — | yes (side-effect: creates proposal_card message, notifications) |
| Vote on proposal | POST | /plans/{id}/proposals/{pid}/vote | yes (rollback on 409) | — |
| Unvote | DELETE | /plans/{id}/proposals/{pid}/vote | yes | — |
| Finalize plan | POST | /plans/{id}/finalize {place_proposal_id, time_proposal_id} | — | yes (side-effect: supersedes losers, notifications) |
| Unfinalize plan | POST | /plans/{id}/unfinalize | — | yes (side-effect: reopens proposals, notifications) |
| Cancel plan | POST | /plans/{id}/cancel | — | yes |
| Complete plan | POST | /plans/{id}/complete | — | yes |
| Repeat plan | POST | /plans/{id}/repeat | — | yes (side-effect: creates new plan, invitations, notifications) |

Creator-only actions: finalize, unfinalize, cancel, invite participant. Server must verify `creator_id === auth.uid`.

---

## PlanDetailsScreen — Chat Tab

| Action | Method | Endpoint | Optimistic | Server-confirmed |
|---|---|---|---|---|
| Load messages | GET | /plans/{id}/messages?limit=50 | — | — |
| Send message | POST | /plans/{id}/messages {text} | yes (append locally, mark failed on error) | confirmed via response |
| Paginate (scroll up) | GET | /plans/{id}/messages?before=...&limit=50 | — | — |

---

## GroupDetailsScreen

| Action | Method | Endpoint | Optimistic | Server-confirmed |
|---|---|---|---|---|
| Load group | GET | /groups/{id} | — | — |
| Add member | POST | /groups/{id}/members {user_id} | — | yes (side-effect: invitation + notification) |
| Remove member | DELETE | /groups/{id}/members/{uid} | — | yes |
| Create plan with group | POST | /plans (with group member IDs in participant_ids) | — | yes |

Creator-only: add/remove members. Server must verify `groups.creator_id === auth.uid`.

---

## NotificationsScreen

| Action | Method | Endpoint | Optimistic | Server-confirmed |
|---|---|---|---|---|
| Load notifications | GET | /notifications?limit=50 | — | — |
| Mark one read | PATCH | /notifications/{id}/read | — | — |
| Mark all read | PATCH | /notifications/read-all | — | — |

Notifications are created server-side only. No client-side notification creation.

---

## ProfileScreen

| Action | Method | Endpoint | Optimistic | Server-confirmed |
|---|---|---|---|---|
| Load profile | GET | /users/me | — | — |
| Edit profile | PATCH | /users/me {name, username, avatar_url} | — | yes |
| Load saved events | GET | /events (client filters by saved IDs, or server endpoint with ?saved=true) | — | — |
| Load friends | GET | /users/friends?status=accepted | — | — |
| Load incoming requests | GET | /users/friends?status=pending&direction=incoming | — | — |
| Search users | GET | /users/search?q=...&limit=20 | — | — |
| Send friend request | POST | /users/friends/:id | — | yes (side-effect: `friend_request` notification) |
| Accept / decline friend request | PATCH | /users/friends/:id {action: accept \| decline} | — | yes |
| Remove friend / cancel outgoing request | DELETE | /users/friends/:id | — | yes |
| Logout | client-side | discard tokens | — | — |

---

## PlanShareLinkLandingScreen

Entry: deep link `fest://p/:token` (e.g. from a share-sheet URL).

| Action | Method | Endpoint | Optimistic | Server-confirmed |
|---|---|---|---|---|
| Load preview (unauth-OK) | GET | /plans/by-token/:token | — | — |
| Join plan | POST | /plans/by-token/:token/join | — | yes (side-effect: creator gets `plan_join_via_link` notification) |

Join requires auth. If caller isn't logged in, route through `AuthScreen` first and resume with the same token. If the caller is already a participant, the API returns `already_joined=true` and no duplicate notification is created.
