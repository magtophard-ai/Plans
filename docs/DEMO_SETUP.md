# Demo Setup — запуск стека для теста на реальном телефоне

Этот гайд повторяет то, что я делаю, когда тебе нужно протестировать приложение
через Expo Go на iPhone / Android. Цель — получить работающий стек из четырёх
кусочков: Postgres, backend, публичный URL backend'а, Expo tunnel → QR на
телефон.

Критически важно: телефон должен доставать *и* JS-бандл (через Expo tunnel),
*и* backend (через публичный URL). Запускать только Expo — бесполезно: API и
WS с `localhost:3001` с телефона недоступны.

---

## 0. Что понадобится

- Docker (для Postgres)
- Java 21 (для canonical Spring backend)
- Node 22.x (проект пина — `22.12.0`)
- `npm`
- `npx` + установленный `expo` CLI (подтянется сам через `npx`)
- [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) —
  для публичного URL backend'а без аккаунта.
- `qrencode` — опционально, для генерации QR из терминала.
- Expo Go **под SDK 54** на телефоне (см. App Store / Google Play).

---

## 1. Postgres

Проект использует Postgres 17. Один раз подними контейнер:

```bash
docker run -d --name fest-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=plans \
  -p 5432:5432 \
  postgres:17
```

Проверка:

```bash
docker exec fest-pg pg_isready -U postgres
```

Если контейнер уже был создан — `docker start fest-pg`.

---

## 2. Backend

Canonical backend — Spring Boot в `backend-spring/`. Старый Fastify backend в `backend/` является archived/legacy и не используется для активной проверки.

### 2.1 Настроить env и стартовать Spring

В отдельном терминале (не закрывай):

```bash
cd backend-spring
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/plans
export JWT_SECRET=dev-secret
export OTP_CODE=1111
export PORT=3001
./gradlew bootRun
```

Spring запускает Flyway миграции автоматически. `OTP_CODE=1111` — мок-код, который будет приниматься `POST /auth/otp/verify`; реальный SMS-провайдер не подключён.

Проверка:

```bash
curl http://localhost:3001/api/health
# {"status":"ok"}
```

### 2.2 Seed для manual run

Если dev seed не загружен автоматически для ручного запуска, выполни из repo root во втором терминале:

```bash
psql postgres://postgres:postgres@localhost:5432/plans \
  -f backend-spring/src/main/resources/db/seed/R__dev_seed.sql
```

Seed создаёт 6 демо-пользователей:

| Phone | Name |
|---|---|
| `+79990000000` | Я (основной) |
| `+79991111111` | Маша |
| `+79992222222` | Дима |
| `+79993333333` | Лена |
| `+79994444444` | Артём |
| `+79995555555` | Катя |

+ venues, events, пара планов.

---

## 3. Публичный URL для backend'а (cloudflared)

Без аккаунта. В отдельном терминале:

```bash
cloudflared tunnel --url http://localhost:3001
```

В выводе появится что-то вида:

```
Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):
https://<random-slug>.trycloudflare.com
```

Запоминаем этот URL — это `BACKEND_PUBLIC_URL`. Проверяем:

```bash
curl https://<slug>.trycloudflare.com/api/health
# {"status":"ok"}
```

> Альтернативы:
> - **ngrok** — `ngrok http 3001` (нужен аккаунт / authtoken).
> - `deploy expose 3001` — если используешь встроенный expose-инструмент.
>
> Cloudflared быстрее всего: без регистрации, без basic-auth, URL стабилен до
> `Ctrl+C`.

---

## 4. Frontend (Expo) с правильным env

Env переменные вида `EXPO_PUBLIC_*` запекаются в JS-бандл Metro'ом на этапе
бандлинга. Их нужно выставлять **перед** `npx expo start`, а не после.

```bash
cd fest-app
npm install --legacy-peer-deps   # SDK 54 имеет peer-conflicts, это нормально

export BACKEND_PUBLIC_URL=https://<slug>.trycloudflare.com
export EXPO_PUBLIC_API_BASE_URL="$BACKEND_PUBLIC_URL/api"
export EXPO_PUBLIC_WS_BASE_URL="wss://${BACKEND_PUBLIC_URL#https://}/api/ws"

npx expo start --tunnel --go
```

Флаги:
- `--tunnel` — раздаёт JS-бандл через `exp.direct` (ngrok под капотом), чтобы
  телефон мог качать бандл не из той же Wi-Fi сети.
- `--go` — генерит URL формата `exp://…exp.direct`, который Expo Go понимает
  напрямую.
- `--clear` — добавить при обновлении нативных зависимостей, иначе Metro может
  отдать старый кэш.

В логе должно быть:

```
Tunnel connected.
Tunnel ready.
› Metro waiting on exp://<slug>-anonymous-8081.exp.direct
```

Проверка, что env запёкся:

```bash
curl -s 'http://localhost:8081/index.ts.bundle?platform=ios&dev=true&hot=false' \
  -o /tmp/bundle.js
grep -c 'trycloudflare.com' /tmp/bundle.js   # должен быть > 0
```

---

## 5. QR для телефона

Если не хочешь смотреть в терминал:

```bash
qrencode -o qr.png -s 10 -m 2 'exp://<slug>-anonymous-8081.exp.direct'
open qr.png   # macOS; на Linux: xdg-open qr.png
```

В Expo Go на телефоне — `Scan QR Code`, сканируешь, ждёшь ~30-60 сек на первую
сборку, дальше работает.

Если ты на одной Wi-Fi с машиной — можно без QR, просто вбить URL руками:
`exp://<slug>-anonymous-8081.exp.direct` в Expo Go (Enter URL manually).

---

## 6. Smoke-проверки перед отправкой клиенту

1. `curl $BACKEND_PUBLIC_URL/api/health` → `{"status":"ok"}`
2. `curl -X POST $BACKEND_PUBLIC_URL/api/auth/otp/send -H 'content-type: application/json' -d '{"phone":"+79990000000"}'` → `{}` (HTTP 200; пустое тело — это норма)
3. `curl -X POST $BACKEND_PUBLIC_URL/api/auth/otp/verify -H 'content-type: application/json' -d '{"phone":"+79990000000","code":"1111"}'` → `{ "token": "...", "user": {...} }`
4. С полученным `token`:
   `curl -H "authorization: Bearer $TOKEN" $BACKEND_PUBLIC_URL/api/events` → список из 6 событий.
5. В Expo Go — Onboarding → Auth → OTP `1111` → список грузится → открывается
   детальный экран.

Если на шаге (2) или (3) 502 — бэкенд упал. См. [Troubleshooting](#troubleshooting).

---

## 7. Что дать тестеру

- QR (картинка) или URL `exp://…exp.direct`
- `BACKEND_PUBLIC_URL`
- Тестовый номер: `+79990000000`
- OTP код: `1111`
- Короткий чек-лист: «открой приложение → пройди онбординг → залогинься → открой план → отправь сообщение».

---

## 8. Остановка / перезапуск

```bash
# frontend
Ctrl+C в терминале с npx expo start

# backend public URL
Ctrl+C в терминале с cloudflared

# backend
Ctrl+C в терминале с ./gradlew bootRun

# postgres
docker stop fest-pg     # или оставить — он съест ~150 MB RAM
```

После рестарта VM/машины `trycloudflare.com` и `exp.direct` URL'ы умирают —
cloudflared и Expo tunnel нужно поднять заново, URL будут другими, QR и
env-переменные тоже придётся перегенерировать.

---

## 9. Troubleshooting

### «HTTP 502» в приложении, curl на public URL висит / 502

`cloudflared` живёт, а backend упал. Проверь:

```bash
curl http://localhost:3001/api/health
```

Если тут тоже не ответ — смотри логи Spring backend'а в том терминале. Подробности по
типовым падениям — в `backend-spring/README.md` и `docs/RUNBOOK.md`.

### `[runtime not ready]: Error: Exception in HostFunction: <unknown>` при сканировании QR

Версии native-модулей в бандле не совпадают с тем, что зашито в Expo Go SDK 54.
Чиним:

```bash
cd fest-app
npx expo install --fix -- --legacy-peer-deps
npx expo install react-native-worklets -- --legacy-peer-deps   # если Reanimated 4 жалуется
```

Потом `npx expo start --tunnel --go --clear`.

### `column "X" of relation "..." does not exist`

Flyway миграция или dev seed не применились. Перезапусти Spring и проверь логи Flyway в `backend-spring`.
Для ручной демо-базы повторно загрузи `backend-spring/src/main/resources/db/seed/R__dev_seed.sql` через `psql`.

### OTP приходит «не тот»

В dev у нас `OTP_CODE=1111` → код всегда `1111`. Реальный SMS-провайдер
не подключён (это отдельный пункт в roadmap).

### `EXPO_PUBLIC_API_BASE_URL` не подхватился

Забыл экспортировать **перед** `npx expo start`. Переменная запекается в
бандл один раз; смена после старта требует `--clear` и полной пересборки.

### Tunnel Expo быстро умирает / переподключается

`ngrok` (Expo подкапотно использует его) рубит бесплатные туннели при
долгой неактивности. Открой экран в Expo Go или просто перезапусти
`npx expo start --tunnel --go`.

---

## 10. Диаграмма

```
┌─────────┐       exp.direct (ngrok)      ┌──────────┐
│ iPhone  │ ─────────────────────────────>│  Expo    │  JS bundle
│ Expo Go │                               │  Metro   │
└─────────┘                               └──────────┘
     │
     │   HTTPS / WSS
     ▼
┌───────────────────────────┐    tunnel   ┌─────────────┐   TCP   ┌────────────┐
│ *.trycloudflare.com       │ ──────────> │ cloudflared │ ──────> │ backend    │
│ (публичный URL backend'а) │             │  (на VM)    │         │ Spring :3001│
└───────────────────────────┘             └─────────────┘         └─────┬──────┘
                                                                        │
                                                                        ▼
                                                                  ┌──────────┐
                                                                  │ postgres │
                                                                  │  :5432   │
                                                                  └──────────┘
```
