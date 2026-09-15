# Code review — 2026-09-11

Historical pre-migration report: Cloudflare references and deployment results below describe the retired platform, not current operating instructions or current verification. Use README.md and AGENTS.md for Node/PostgreSQL/Docker workflows. Findings require revalidation against the current implementation.

Reviewed the API routes, authentication, SQL queries and migrations, frontend data
loading and core pages, upload flow, and project configuration. This directory
has no Git repository, so this is a review of the current files, not their history.

## Remaining findings, in priority order

1. **P1 — Workspace deletion leaves uploaded files in R2.**
   `src/worker/routes/admin.ts:100` calls the database-only `deleteWorkspace`.
   That deletes resource metadata but never deletes bucket objects, leaving
   inaccessible files behind indefinitely. Add durable, retryable cleanup keyed
   by workspace prefix, and handle uploads already in progress during deletion.
   The upload rollback added in this review does not solve workspace deletion.

2. **P2 — Calendar month queries use UTC boundaries for a local calendar.**
   `src/worker/middleware/validation.ts:83` constructs UTC midnight from date-only
   query parameters. The frontend groups dates in the viewer's local timezone.
   In Taipei, an event at September 1, 00:30 is August 31, 16:30 UTC and can be
   excluded from September's query. Pass explicit instant boundaries from the
   frontend. Also reject malformed/reversed ranges rather than silently issuing
   an effectively unbounded query.

3. **P2 — Multi-day calendar events disappear after their first day.**
   `src/frontend/components/CalendarMonth.tsx:33` indexes only `start_at`, although
   the API returns events overlapping the requested range. Events beginning in
   the previous month can be fetched but never displayed. Expand intervals across
   visible calendar days and test month boundaries.

4. **P2 — All-day end dates are inconsistent between editor and export.**
   `src/frontend/components/EventDialog.tsx` allows the same start/end date, while
   `src/frontend/lib/gcal.ts:38` adds a day only when end is not after start.
   A September 1–3 all-day event exports with September 3 excluded. Establish one
   inclusive/exclusive convention and use calendar-day arithmetic across DST.

5. **P2 — Some frontend failures remain silent, and note loads can race.**
   `src/frontend/pages/TasksPage.tsx:45`, `ResourcesPage.tsx:75`, and
   `NotesPage.tsx:30` contain uncaught async mutations or loads. A failed request
   can produce no visible explanation; rapidly opening two notes can load the
   older note last. `WorkspaceGuard` also treats any server/network error as a
   locked workspace. Add explicit error states and request cancellation/order
   guards to these flows. The shared `useAsync` race fix does not cover them.

6. **P2 — Project ownership checks are application-level, not database constraints.**
   The new checks reject missing or foreign projects for ordinary requests, but a
   project can be deleted between validation and insertion. The existing schema
   has no foreign keys. A future migration should enforce workspace/project
   integrity after auditing and repairing existing orphan references.

7. **P2 — Upload limits are checked after multipart parsing.**
   `src/worker/routes/files.ts:43` buffers/parses the request before checking file
   size. Enforce a streamed request-body cap, including requests without a reliable
   Content-Length, before multipart parsing. Extension/MIME checks also do not
   verify file signatures. Download responses now include `nosniff`, but that is
   not content validation.

## Fixed in this review

- Password rotation now changes the password and removes existing workspace
  sessions in one database batch. Other workspace sessions are preserved.
- JSON routes now reject malformed, null, array, and primitive bodies with 400
  instead of throwing 500s or silently accepting malformed updates. Header-only
  admin login remains supported.
- Tasks, events, notes, resources, and uploads check project ownership before
  accepting references. Project deletion clears child links in one batch while
  preserving the contents in the workspace.
- Event updates validate the effective start/end interval in the UPDATE query,
  including partial updates and concurrent changes.
- Empty updates to nonexistent projects, tasks, notes, and events return 404.
- Integer timestamp validation rejects booleans, arrays, fractions, whitespace,
  and out-of-range values instead of coercing or truncating them.
- Note saves preserve Markdown whitespace and indentation.
- Failed upload metadata writes attempt to remove the newly uploaded R2 object.
  Downloads use `X-Content-Type-Options: nosniff`.
- Shared asynchronous data loading ignores superseded results and invalidates
  pending results on cleanup. Synchronous loader errors also enter its error state.
- New event defaults handle the 23:00-to-midnight rollover correctly. Successful
  event deletion releases the busy state so reopening the editor remains usable.
- Unlock enforces the same password length cap used when setting passwords.
  Admin session checks explicitly fail closed when the secret is missing.
- Removed duplicate cookie configuration and unused date/format/session-cleanup
  helpers. Corrected stale README claims about a placeholder database and documented
  that development uses remote D1/R2 resources. Unused does not establish age.

## Verification and limits

- `npm test`: 12 regression tests using actual API handlers and SQL against an
  isolated SQLite adapter, plus an in-memory R2 stub.
- `npm run typecheck`: frontend, worker, and build configuration pass.
- `npm run build`: production frontend build passes.
- Review tests did not access production resources. Deployment was subsequently
  requested and completed as recorded below.
- Browser interactions and Cloudflare runtime behavior were not exercised. The
  frontend fixes have compile/build validation, not browser regression coverage.
- No dependency vulnerability audit or exhaustive security review was performed.
- R2 and D1 are not one transaction: rollback cleanup itself can fail. Durable
  reconciliation is still needed for strong guarantees.

Original source files, package.json, and README.md were copied before editing to
`/tmp/research-workspace-review-backup/` because no Git checkout was available.

## Deployment after review

At the user's request, applied the pending `0002_event_details.sql` migration and
ran `npm run deploy`. Wrangler confirmed DB, BUCKET, and ASSETS bindings.

- URL: https://research-workspace.fentech1225.workers.dev
- Version: `f376154c-4112-4163-97ee-4c6e8eaf2d5f`
- Homepage: HTTP 200.
- `/api/admin/session`: HTTP 200, `{"authenticated":false}` without credentials.
- Remote migration list: no pending migrations.

These are availability smoke checks, not authenticated end-to-end coverage.
