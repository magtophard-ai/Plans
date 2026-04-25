# Fest&Rest / "Планы?" — V1

## Tech Stack
- **Frontend**: React Native + Expo + TypeScript
- **State**: Zustand
- **Navigation**: React Navigation (bottom tabs + native stack)
- **Backend**: Mock-first (Phase 1-3), real backend later

## Prerequisites
- Node.js v18+
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
```bash
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
│   ├── mocks/           # Hardcoded mock data
│   └── navigation/      # Navigation helpers (future)
├── assets/              # Icons, images
└── docs/                # Product plan document
```

## Common Commands
- **Start dev**: `npx expo start`
- **Type check**: `npx tsc --noEmit`
- **Android**: `npx expo start --android`
- **iOS**: `npx expo start --ios`
- **Web**: `npx expo start --web`

## NPM Cache (Disk C full)
All npm commands must use: `$env:npm_config_cache="E:\npm-cache"; npm <command> --legacy-peer-deps`

## Product Document
See `docs/ProductPlan.md` for the canonical product spec.
