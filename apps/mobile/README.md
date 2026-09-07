# Mobile development

Start Web from the repository root:

```sh
pnpm --filter ./apps/mobile run web
```

Run a separate backend at the configured target to use the API routes.

The Metro development server proxies `/api`, `/api/*`, and `/health` to
`http://127.0.0.1:8080`, preserving paths, query strings, request bodies, and
streaming responses. Browser requests can use same-origin URLs:

```js
fetch("/api/v1/ping");
```

To change the upstream, set `DEV_API_PROXY_TARGET` in `apps/mobile/.env.local`
or in the shell before starting Expo. Restart Expo after changing it.

```sh
DEV_API_PROXY_TARGET=http://127.0.0.1:9000 pnpm --filter ./apps/mobile run web
```

Requests sent directly to another origin still require that server's CORS
support. The AI Base URL in settings remains a direct OpenAI-compatible
connection; these API proxy routes do not adapt that protocol to the Go API.

This proxy only runs in the development server. Static web deployments need
their own same-origin reverse proxy or API CORS configuration. Native apps
need a backend URL reachable from the device.
