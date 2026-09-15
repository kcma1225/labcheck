---
name: redeploy
description: Redeploy Research Workspace using Docker Compose, PostgreSQL and persistent local file volumes. Use for explicit deploy, ship, release or production requests.
---

# Redeploy Research Workspace

## Preconditions

1. Require explicit deployment authorization; code changes and QA do not authorize deployment.
2. Confirm project root contains `compose.yaml`, `Dockerfile`, and the expected package name.
3. Confirm target Docker context, host and stable Compose project name with the user. Never assume a local Docker context is the requested production host.
4. Check Docker/Compose availability. Inspect configuration without printing interpolated secrets (`docker compose config --quiet`). Verify required secret presence without displaying values. Do not replace existing `.env` or `.dev.vars`.
5. Confirm `PUBLIC_ORIGIN`, an HTTPS reverse proxy in front of Nginx's published `HTTP_PORT`, and backups of both PostgreSQL and the complete files volume. Nginx (port 80 by default) is the only published service; the app and PostgreSQL are not host-published.
6. Run `npm test`, `npm run typecheck`, `npm run build`. Run isolated PostgreSQL integration tests with `compose.test.yaml` if available; report any skipped validation.
7. Review schema compatibility. Startup reruns the one idempotent baseline under a transaction/advisory lock; existing columns are not altered automatically. Any one-off SQL requires separate review, backups and authorization.

## Deploy

Run `npm run deploy` only in the confirmed target context/project; it executes `docker compose up -d --build --wait`. Preserve existing named volumes. Never run `down -v`, remove volumes, rotate secrets, or perform legacy cloud exports as a redeploy side effect.

## Verify

- Check container health and `/api/health`, admin session response, SPA deep links and literal `/offline.html` on the configured origin.
- Confirm no secrets appear in logs; investigate failures locally without dumping environment configuration.
- Report the user-configured origin and actual verification results, not an invented URL.
- Do not create production test workspaces without separate authorization.

## Rollback and limitations

Retain the prior image and matched database/files backup. An image-only rollback requires compatible schema; otherwise restore into a separate verified environment before an authorized cutover. Never overwrite or delete live volumes by default.

This deployment does not migrate existing D1/R2 data. Export/import, `r2_key` to `storage_key` mapping, local object metadata conversion and domain/passkey continuity need a separately authorized migration. No Cloudflare credentials or commands are needed. Use one app instance; filesystem and soft process-local limits are not distributed. The app only trusts Nginx's `X-Real-IP` (via `TRUST_PROXY=1`, already set in `compose.yaml`); other forwarded headers are ignored, and real per-client limits belong at the outer TLS proxy.
