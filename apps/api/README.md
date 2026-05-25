# API

Minimal Go Fiber API for local development.

## Run

```bash
go run ./cmd/server
```

## Environment

- `PORT`: listen port, default `8080`
- `CORS_ALLOW_ORIGINS`: comma-separated allowed origins for browser-based development

## Endpoints

- `GET /health`
- `GET /api/v1/ping`
