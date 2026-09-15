# Repository guidance

## Architecture
- Node 22.13+ with Hono, PostgreSQL and private local file storage; no Cloudflare services.
- `src/frontend/main.tsx` is the SPA entrypoint. `src/worker/index.ts` is the pure API; `src/worker/server.ts` owns Node serving, environment setup, startup schema and reminder scheduling. The directory name is historical.
- Only `/api/*` routes to the API; `dist/` serves static files and non-API SPA fallback, with literal `/offline.html`. `dist-server/` contains the backend build.
- `src/worker/types.ts` owns database/storage contracts. PostgreSQL adapter batches are atomic on one client; BIGINT values must stay safe JavaScript integers. Keep `?` SQL placeholders within the adapter's supported ordinary SQL syntax; no dollar-quoted literals or JSON question-mark operators.
- File bodies and metadata live in a private named volume, never static assets. Storage keys map to hashed directories; do not copy raw legacy object keys directly onto disk.

## Commands
- `npm run dev`: Vite 5173 plus Node API 8787. Requires an explicitly local `DATABASE_URL` in ignored `.env` and `PUBLIC_ORIGIN=http://localhost:5173`.
- Required verification: `npm test`, then `npm run typecheck`, then `npm run build`. No lint/formatter command exists.
- SQLite regressions test API behavior, not PostgreSQL integration. Filesystem adapter tests use temporary local directories. Set `TEST_DATABASE_URL` only to a disposable database ending `_test`; `npm run test:postgres` requires it and uses a unique temporary schema.
- `compose.test.yaml` provides isolated PostgreSQL integration QA, separate from deployment configuration. Follow `.agents/skills/review-qa/SKILL.md`; do not use production resources for mutable QA.

## Deployment and data
- Only deploy when explicitly requested. Follow `.agents/skills/redeploy/SKILL.md`; `npm run deploy` runs Docker Compose, not a cloud CLI.
- `compose.yaml` runs Nginx, one non-root app, and PostgreSQL 17 with persistent database/files volumes. Nginx (`nginx/nginx.conf`) is the only published service (`HTTP_PORT`, default 80); it proxies both `/api/*` and the frontend to the app over the internal network. The app container publishes no host port. Keep the Compose project name stable. Never delete production volumes.
- The app trusts Nginx's `X-Real-IP` header for client-IP rate limiting only when `TRUST_PROXY=1` (set in `compose.yaml`). Never set `TRUST_PROXY=1` outside that topology — it would let clients spoof their IP if anything but Nginx can reach the app socket. `npm run dev`/`npm start` must leave it unset.
- Startup applies `migrations/0001_initial.sql`, then `migrations/0002_tasks_resource.postgres.sql`, in one transaction under the existing advisory lock. The PostgreSQL-only upgrade idempotently adds `tasks.resource_id` before its index; no manual SQL is needed for this column. Keep the baseline SQLite-compatible. This is not a legacy-data importer; future incompatible changes need reviewed migrations and backups.
- No automatic D1/R2 export/import or production cutover. Existing data needs a separately authorized migration and verification. Preserve existing `.dev.vars` and ignored secrets; the runtime only loads `.env` or injected environment variables.
- Never log, commit or bake `DATABASE_URL`, `POSTGRES_PASSWORD`, `ADMIN_SECRET`, or `VAPID_PRIVATE_KEY_JWK` into images. `.env.example` contains placeholders only.
- `PUBLIC_ORIGIN` is trusted operator configuration for passkeys, URLs and Secure cookies. Nginx terminates plain HTTP only; put TLS in front of it for production. Real per-client rate limiting belongs at that outer TLS proxy, since every client shares one bucket from Nginx's perspective otherwise.
- Single-instance filesystem and process-local limiter constraints remain. Reminders run every 30 minutes with overlap prevention/advisory locking; delivery remains best-effort. No WebSocket routes exist; Nginx has no Upgrade/Connection headers configured.
