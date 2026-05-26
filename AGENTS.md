This repository is a pnpm monorepo with:

- `apps/mobile`: Expo / React Native mobile app
- `apps/api`: Go Fiber API
- `packages/*`: reserved for shared packages

Before carrying out tasks related to a library, framework, SDK, API, CLI tool, or cloud service, first consult the Context7 documentation.

Keep code concise. When a requirement cannot be fulfilled simply, explain the intended implementation path before introducing a more complex solution.

The entire code repository should remain in English. Add comments only when necessary. Do not place prompt-related or conversational text into the codebase.

## Common commands

Run all commands from the repository root unless noted otherwise.

- `pnpm install`: Install workspace dependencies using pnpm `10.17.1`.
- `pnpm dev`: Start the Expo mobile app and Go API together through workspace filters.
- `pnpm dev:mobile`: Start only `apps/mobile` using Expo.
- `pnpm dev:api`: Start only `apps/api`; this runs `go run ./cmd/server`.
- `pnpm lint`: Run mobile linting through `expo lint`.
- `pnpm --filter ./apps/mobile run android`: Run the Expo app on Android with `expo run:android`.
- `pnpm --filter ./apps/mobile run ios`: Run the Expo app on iOS with `expo run:ios`.
- `pnpm --filter ./apps/mobile run web`: Start the Expo web target.
- `cd apps/api && go run ./cmd/server`: Run the API directly from the Go module.
- `cd apps/api && go test ./...`: Run Go tests when API test files are added.

There is currently no root `build`, `test`, or TypeScript `typecheck` script. Do not assume one exists without checking `package.json`.

## Architecture overview

The repository is organized as a lightweight pnpm workspace. The root `package.json` only coordinates workspace scripts and development tooling such as Husky and commitlint. `pnpm-workspace.yaml` includes `apps/*` and `packages/*`, with `nodeLinker: hoisted`.

`apps/mobile` is an Expo app using `expo-router` as the entry point. The root layout is `apps/mobile/app/_layout.tsx`, which wraps the app with gesture handling, share-intent handling, configuration state, a global nebula background, and a router stack. Route files under `apps/mobile/app` define the main screens: chat home, settings, personal page, memory visualization, journal, and calendar.

The mobile app uses React Native, Expo SDK 54, React 19, TypeScript strict mode, Expo Router, React Navigation, Skia, AsyncStorage, Expo Calendar, Expo Image Picker, Expo Share Intent, localization, and AI SDK packages. Path alias `@/*` points to the mobile app root.

Mobile configuration is split across `lib` and `context`. `lib/api.ts` resolves the API base URL, using `EXPO_PUBLIC_API_BASE_URL` when provided and platform-specific localhost defaults otherwise. `lib/config.ts` manages AI provider settings, defaulting to an OpenAI-compatible endpoint and storing user configuration in AsyncStorage. `context/config.tsx` exposes that configuration to screens.

The chat screen integrates image picking, camera access, share-intent input, OpenAI-compatible model creation, and AI SDK streaming. UI primitives and theme values live under `apps/mobile/components/ui`. Visual memory graph data is currently mock-driven through `lib/memoryTreeMock.ts`.

`apps/api` is a separate Go module. The API entry point is `apps/api/cmd/server/main.go`, which loads configuration and starts the HTTP server. Configuration lives in `internal/config`, reading `PORT` and `CORS_ALLOW_ORIGINS` with local development defaults. HTTP setup lives in `internal/http/router.go`, using Fiber v3 middleware for recovery, logging, and CORS. The current routes are `GET /health` and `GET /api/v1/ping`.

Environment examples exist in both apps. Mobile uses `apps/mobile/.env.example` for `EXPO_PUBLIC_API_BASE_URL`. API uses `apps/api/.env.example` for `PORT` and CORS origins. README documents local API base URL choices for web, Android emulator, iOS simulator, and physical devices.

Commit messages are checked by Husky through `.husky/commit-msg`, which runs commitlint with the conventional commits config.
