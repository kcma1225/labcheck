---
name: review-qa
description: Review Research Workspace for bugs, legacy code and maintainability; run isolated automated and browser QA against Node, PostgreSQL and local file storage.
---

# Research Workspace review and QA

## Baseline

Read AGENTS, package scripts, Docker/Compose configuration, schema and affected source. Inspect Git status/diff and preserve user changes and ignored secrets. Historical CODE_REVIEW findings are leads, not current evidence. Never contact or mutate production resources for QA.

Run `npm test`, then `npm run typecheck`, then `npm run build`. Node 22.13+ is required. No lint script exists. Record each result separately: SQLite API tests are behavioral coverage, not PostgreSQL proof; filesystem adapter tests use temporary directories. PostgreSQL tests skip without `TEST_DATABASE_URL`; `npm run test:postgres` requires it and refuses database names not ending `_test`.

## Isolated integration QA

Use `docker compose -f compose.test.yaml -p workspace-qa up --build --abort-on-container-exit --exit-code-from test`. This standalone configuration has a disposable PostgreSQL database and no production secrets or volumes. Check Docker context is local before starting. Clean up only this project with `docker compose -f compose.test.yaml -p workspace-qa down -v`.

Alternatively use an explicitly provisioned local test database ending `_test`. Set only `TEST_DATABASE_URL`; never copy deployment DATABASE_URL. Tests create and remove a randomly named schema, and test migrations, BIGINT decoding, transaction rollback, SQL parameters, API CRUD and filesystem persistence. Record actual PostgreSQL version and results.

## Review boundaries

- Sessions, password rotation, workspace ownership, missing records and malformed payloads.
- PostgreSQL parameter typing, BIGINT safety, atomic batches, partial updates and concurrent validation.
- Filesystem containment, metadata/body atomic publication, interrupted uploads, pre-parse body limits, authenticated downloads and database/files consistency.
- PUBLIC_ORIGIN-driven passkeys/URLs/cookies. The app trusts Nginx's `X-Real-IP` only when `TRUST_PROXY=1`; other forwarded headers are ignored. Anonymous clients behind the outer TLS proxy share one limit from Nginx's perspective — real per-client limits belong there.
- Single-instance local storage, process-local rate limiting, advisory reminder locks and graceful shutdown.
- Frontend stale requests, rejected mutations, notes whitespace, calendar time boundaries and resource access.

Keep fixes focused and add regression coverage. Do not rewrite the schema history or perform external migrations during review. Existing workspace deletion/orphan retention needs explicit scrutiny; do not assume all child data or files are removed.

## Browser QA

Load the ego-browser skill before browser automation. Use a separate disposable Compose project, generated test-only secrets, a free loopback port and fresh database/files volumes. Do not load deployment `.env`: supply a temporary test-only env file explicitly and ensure configuration resolves only to local containers. Set PUBLIC_ORIGIN to the local browser origin and leave VAPID empty to avoid real push delivery.

Exercise admin create/login, workspace unlock/lock and isolation; tasks/tabs/groups CRUD; notes save/reopen; calendar editing and boundaries; file upload/download/delete, rejected types and oversize payloads; SPA deep links, literal offline page, narrow viewport and keyboard interaction. Restart the disposable app and verify database and file persistence. API-only checks must be labeled as such, not browser passes.

If Docker/browser is unavailable, continue independent checks and clearly report untested cases. Never substitute production mutations. Stop only processes you started and remove only the disposable project resources.

## Report

Rerun required checks after fixes. When requested, update existing CODE_REVIEW with unresolved findings first, file/line references, confirmed fixes, actual QA passes/failures/skips and limitations. Do not invent results or imply SQLite verifies PostgreSQL. Deployment is separate and requires explicit authorization; follow the redeploy skill only then.
