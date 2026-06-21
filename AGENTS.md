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
- `pnpm typecheck`: Run mobile TypeScript checking through `tsc --noEmit`.
- `pnpm --filter ./apps/mobile run android`: Run the Expo app on Android with `expo run:android`.
- `pnpm --filter ./apps/mobile run ios`: Run the Expo app on iOS with `expo run:ios`.
- `pnpm --filter ./apps/mobile run web`: Start the Expo web target.
- `cd apps/mobile/android && $env:EXPO_NO_METRO_WORKSPACE_ROOT="1"; .\gradlew.bat assembleRelease --no-daemon`: Build a local Android release APK on Windows PowerShell.
- `cd apps/api && go run ./cmd/server`: Run the API directly from the Go module.
- `cd apps/api && go test ./...`: Run Go tests when API test files are added.

There is currently no root `build` or `test` script. Do not assume one exists without checking `package.json`.

## Architecture overview

The repository is organized as a lightweight pnpm workspace. The root `package.json` only coordinates workspace scripts and development tooling such as Husky and commitlint. `pnpm-workspace.yaml` includes `apps/*` and `packages/*`, with `nodeLinker: hoisted`.

`apps/mobile` is an Expo app using `expo-router` as the entry point. The root layout is `apps/mobile/app/_layout.tsx`, which wraps the app with gesture handling, share-intent handling, configuration state, a global nebula background, and a router stack. Route files under `apps/mobile/app` define the main screens: chat home, memory inbox, settings, personal page, memory visualization, journal, and calendar.

Android release bundling in this monorepo requires `EXPO_NO_METRO_WORKSPACE_ROOT=1`. The repository includes `.github/workflows/android-release-build.yml`, which builds `assembleRelease`, uploads the APK as an artifact, and attaches it to a published GitHub Release.

The mobile app uses React Native, Expo SDK 54, React 19, TypeScript strict mode, Expo Router, React Navigation, Skia, d3-force, AsyncStorage, Expo SQLite, Expo Calendar, Expo Image Picker, Expo Share Intent, localization, react-native-ble-plx, and AI SDK packages. Path alias `@/*` points to the mobile app root.

Mobile configuration is split across `lib` and `context`. `lib/config.ts` manages local OpenAI-compatible provider settings and stores user configuration in AsyncStorage. `context/config.tsx` exposes that configuration to screens. Cloud mode is not currently implemented.

The chat screen integrates image picking, camera access, share-intent input, local OpenAI-compatible streaming, and local memory candidate creation. Long-term memory is local-first: `episodes` store raw fragments, `memory_candidates` store AI suggestions, `memory_atoms` and `reflections` store user-confirmed memory, and `entities` / `relations` support graph structure. UI primitives and theme values live under `apps/mobile/components/ui`. The memory graph is rendered with Skia and laid out with d3-force.

BLE screen-off capture is designed around the in-repository `iot` firmware for Seeed Studio XIAO ESP32S3 Sense. Mobile BLE uses `react-native-ble-plx`, so scanning and subscription require a native development build rather than Expo Go or web.

`apps/api` is a separate Go module. The API entry point is `apps/api/cmd/server/main.go`, which loads configuration and starts the HTTP server. Configuration lives in `internal/config`, reading `PORT` and `CORS_ALLOW_ORIGINS` with local development defaults. HTTP setup lives in `internal/http/router.go`, using Fiber v3 middleware for recovery, logging, and CORS. The current routes are `GET /health` and `GET /api/v1/ping`.

Environment examples exist in both apps. API uses `apps/api/.env.example` for `PORT` and CORS origins. Mobile runtime AI connection details are entered in the settings screen and stored locally.

Commit messages are checked by Husky through `.husky/commit-msg`, which runs commitlint with the conventional commits config.
