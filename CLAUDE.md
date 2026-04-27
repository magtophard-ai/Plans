# Fest&Rest / "Планы?" — V1

## Tech Stack
- **Frontend**: React Native + Expo + TypeScript
- **State**: Zustand
- **Navigation**: React Navigation (bottom tabs + native stack)
- **Backend**: Spring Boot (`backend-spring/`) is the canonical backend; Fastify in `backend/` is archived legacy

## Prerequisites
- Java 21
- Node.js 22.x
- npm or npx
- Expo Go (for mobile testing)

## Installation

From the repo root:

```bash
cd fest-app
npm install --legacy-peer-deps
```

On Windows, prefix with `$env:npm_config_cache="E:\npm-cache";` if disk C is
full on the dev box (see `AGENTS.md`).

## Development

Canonical backend:

```bash
cd backend-spring
PORT=3001 ./gradlew bootRun
```

Frontend:

```bash
cd fest-app
export EXPO_PUBLIC_API_BASE_URL=http://localhost:3001/api
export EXPO_PUBLIC_WS_BASE_URL=ws://localhost:3001/api/ws
npx expo start
```

## Project Structure
```
fest-app/
├── App.tsx              # Entry: auth gate + tab navigator
├── src/
│   ├── types/           # TypeScript entity types
│   ├── theme/           # Soft Shell design tokens
│   ├── stores/          # Zustand stores (auth, events, plans, groups, notifications, ui)
│   ├── screens/         # All screens (Auth, Home, EventDetails, PlansHub, PlanDetails, CreatePlan, Search, Profile)
│   ├── components/      # Reusable UI components (future)
│   ├── api/             # HTTP/WebSocket API clients
│   └── navigation/      # Navigation helpers (future)
├── assets/              # Icons, images
└── docs/                # Product plan document
```

## Common Commands
- **Start canonical backend**: `cd backend-spring && PORT=3001 ./gradlew bootRun`
- **Spring tests**: `cd backend-spring && ./gradlew test`
- **Spring full smoke**: `cd backend-spring && ./gradlew fullSpringSmokeTest`
- **Frontend type check**: `cd fest-app && npx tsc --noEmit`
- **Android**: `cd fest-app && npx expo start --android`
- **iOS**: `cd fest-app && npx expo start --ios`
- **Web**: `cd fest-app && npx expo start --web`

## NPM Cache (Disk C full)
All npm commands must use: `$env:npm_config_cache="E:\npm-cache"; npm <command> --legacy-peer-deps`

## Product Document
See `docs/ProductPlan.md` for the canonical product spec.
