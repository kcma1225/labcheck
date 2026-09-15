# LabCheck

A self-hosted, password-protected collaborative workspace for research teams — shared calendar, tabs (courses/projects), tasks with linked resources, notes, file uploads, and optional Web Push reminders.

## Stack

React + Vite frontend, a Hono API on Node.js, PostgreSQL, and local file storage — all behind Nginx, running in Docker.

## Quick start

```bash
git clone https://github.com/kcma1225/labcheck.git
cd labcheck
cp .env.example .env
```

Edit `.env`: set `POSTGRES_PASSWORD` and `ADMIN_SECRET` (e.g. `openssl rand -hex 32` each), and `PUBLIC_ORIGIN` to how you'll access it (`http://localhost` for local Docker).

```bash
docker compose up -d --build --wait
```

Open `http://localhost/admin/create-workspace`, enter your `ADMIN_SECRET`, and create a workspace.

## Local development

Requires Node 22.13+ and a local PostgreSQL database.

```bash
npm ci
npm run dev
```

## Verification

```bash
npm test
npm run typecheck
npm run build
```

## Docs

See [`AGENTS.md`](AGENTS.md) for architecture notes, deployment details, HTTPS/proxy policy, backups, and schema migration guidance.

## License

[MIT](LICENSE)
