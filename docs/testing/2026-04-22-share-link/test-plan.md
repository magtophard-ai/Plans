# Test Plan — P1 Plan Share + Deep Link (PR #2)

## What changed (user-visible)
- У каждого плана появился `share_token`. В `PlanDetailsScreen` (верхняя панель, справа от "Назад") — кнопка **Поделиться**.
- На вебе клик по "Поделиться" копирует ссылку `http://<origin>/p/<token>` в буфер обмена + показывает alert.
- Открытие этой ссылки в другой сессии ведёт на новый экран `PublicPlanScreen` с preview (title, creator, participant_count) и кнопкой **Присоединиться**.
- После присоединения у создателя приходит нотификация типа `plan_join_via_link` (🔗 "присоединился по ссылке").

## Env preconditions (already done in setup)
- Postgres `fest-pg` up; миграция применена, в `plans` у всех 3 seed-планов проставлен `share_token`.
- Backend на :3001 (рестарт после миграции — маршруты `/api/plans/by-token/:token` уже отвечают 200).
- Expo web на :8081.
- OTP `1111` (dev).

## Accounts
- **A (создатель)**: `+79990000000` — "Я". Уже creator плана "Кино в субботу" (`share_token=bcf69309791cf210`, lifecycle_state=active).
- **B (получатель)**: `+79994444444` — "Артём". Не участник этого плана (проверено в `plan_participants`).

## Primary flow: Share → Public preview → Join → Notification

### Setup (перед стартом записи)
1. Развернуть окно Chrome на весь экран (`wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`).
2. Окно 1: обычный Chrome, залогиниться как **A** (+79990000000 / 1111).
3. Окно 2 / инкогнито: не логиниться (пустое localStorage).

### Test 1 — Share button копирует ссылку
Actions:
- В окне 1 перейти в раздел "Планы", открыть "Кино в субботу".
- В top bar PlanDetailsScreen нажать **Поделиться**.

**Pass criteria (все должны сойтись):**
- Появляется alert с текстом, начинающимся с `Ссылка скопирована` и содержащим `http://localhost:8081/p/bcf69309791cf210`.
- В консоли браузера: `navigator.clipboard.writeText` вызван с тем же URL (опционально проверить `document.execCommand('paste')` / вручную вставить в адресную строку нового окна).
- Сетевой запрос на `/api/plans/...` не делается (это чисто клиентское действие).

**Fail signature если сломано**: alert не появляется / URL содержит `undefined` / токен `null` / URL вида `https://plans.app/p/null`.

### Test 2 — Unauth deep link: AuthScreen + pending token stash + backend public GET
Actions:
- В том же окне (разлогинен) навигировать на `http://localhost:8081/p/bcf69309791cf210`.
- Параллельно в терминале: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/plans/by-token/bcf69309791cf210` (без Authorization хедера).

**Pass criteria (design-correct behavior):**
- UI: рендерится `AuthScreen` (поле телефона). Это корректно — по дизайну гость отправляется на OTP, а preview открывается после логина.
- `localStorage.pendingJoinToken` содержит `"bcf69309791cf210"` (проверить в Devtools → Application → localStorage). Если пусто — deep-link не был перехвачен, багается sub в `usePendingJoinCapture`.
- Backend curl без Authorization → HTTP `200` и JSON с полями `plan.title = "Кино в субботу"`, `plan.participant_count = 3`, `plan.creator.username = "me"`. Если 401 — endpoint некорректно требует auth.

**Fail signature**:
- localStorage без pendingJoinToken → линк не захвачен.
- curl возвращает 401/403 → GET-роут случайно под auth-guard.
- 404 на curl при валидном токене в БД → роут не зарегистрирован.

### Test 3 — Guest → Login → auto-navigate to PublicPlan
Actions (продолжение из Test 2, то же окно 2):
- Нажать на подсказку "Войдите" (или кнопку, которая возвращает на Auth).
- Авторизоваться как B: `+79994444444` / OTP `1111`.

**Pass criteria:**
- После успешного OTP приложение **автоматически открывает PublicPlanScreen** с preview "Кино в субботу" (не HomeScreen и не последний экран B). В DOM виден title плана.
- localStorage ключ с pending-токеном очищен (проверить в Devtools → Application → localStorage нет `pendingJoinToken` или равен пустой строке).

**Fail signature**: после логина попадаем на Home, PlansTab, или другой экран; preview не открывается.

### Test 4 — Авторизованный join + notification у создателя
Actions (продолжение Test 3, окно 2):
- На PublicPlanScreen нажать **Присоединиться**.

**Pass criteria (несколько, все обязательны):**
- UI показывает успех: кнопка меняется на "Вы в плане" / "Открыть план" или происходит переход на `PlanDetailsScreen` (в котором в списке участников видно "Артём" со статусом going).
- Запрос `POST /api/plans/by-token/bcf69309791cf210/join` → **200**, с заголовком `Authorization: Bearer ...`. Ответ: `{"already_joined":false,"plan":{...}}`.
- В БД (shell-проверка, выполняется параллельно):
  ```sql
  SELECT user_id, status FROM plan_participants
   WHERE plan_id = '72222222-2222-4222-8222-222222222222';
  ```
  должна появиться строка `user_id=<artem_id>, status='going'`, участников стало 4.
- У А (окно 1, раздел **Уведомления**) появляется нотификация с типом `plan_join_via_link` и текстом, упоминающим "Артём".

**Fail signature**:
- Join возвращает 401 / 404 / 409 → код сломан.
- Нет строки в `plan_participants` → транзакция откатилась без ошибки (тихий fail).
- Нотификация отсутствует / с другим типом (`plan_invite_accepted` и т.п.) → семантика уведомления утеряна.

### Test 5 (idempotency edge case) — повторный POST не создаёт дубликата
Actions:
- В окне 2 (B уже в плане после Test 4) перейти обратно на `/p/bcf69309791cf210`, снова нажать **Присоединиться**.

**Pass criteria:**
- Ответ: `{"already_joined":true,"plan":{...}}`, HTTP 200.
- Счётчик участников в БД прежний (`COUNT(*)=4`, не 5). Проверить SQL-запросом.
- В окне 1 у А **не** появляется вторая нотификация `plan_join_via_link`.

**Fail signature**: 500, дубликат строки в `plan_participants`, повторная нотификация.

## Not testing (вне скоупа recording, но важно)
- `PLAN_FULL` на 15+ участниках — покрыто кодом `count >= 15 → 409`, ручная проверка потребует seed 13 юзеров.
- `fest://` scheme на native (Expo web не эмулирует кастомные схемы). Web-путь покрывает логику linking-конфига.
- Universal Links / OG-preview — вне скоупа PR.
