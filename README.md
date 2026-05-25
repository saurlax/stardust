# StarDust Notes

StarDust is now organized as a lightweight monorepo with an Expo mobile app and a Go API.

## Structure

- `apps/mobile`: Expo app
- `apps/api`: Go Fiber API
- `packages`: shared packages reserved for future use

## Getting Started

Install dependencies from the repository root:

```bash
pnpm install
```

Start both services together:

```bash
pnpm dev
```

Run them individually:

```bash
pnpm dev:mobile
pnpm dev:api
```

## API Base URL

Set `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env` when needed.

- Web: `http://localhost:8080`
- Android Emulator: `http://10.0.2.2:8080`
- iOS Simulator: `http://127.0.0.1:8080`
- Physical device: use your LAN IP, for example `http://192.168.1.10:8080`

The API exposes:

- `GET /health`
- `GET /api/v1/ping`
