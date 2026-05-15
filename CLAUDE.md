# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Two-package monorepo, **not** a workspaces setup — install in each side separately:

- **Root** (`/`) — React 18 + Vite frontend (PWA, Tailwind, Zustand, React Query, react-router 7).
- **`backend/`** — Express + Prisma + PostgreSQL + Socket.io. CommonJS (`"type": "commonjs"`), entry `backend/server.js`.

Frontend uses path alias `@` → `/src` (see `vite.config.js`).

## Common commands

Frontend (run from repo root):
```bash
npm install --legacy-peer-deps     # legacy-peer-deps is the convention here
npm run dev                        # vite dev server on :5173
npm run build                      # outputs to dist/ (see "emptyOutDir" note below)
npm run lint                       # eslint, --max-warnings 0
```

Backend (run from `backend/`):
```bash
npm install --legacy-peer-deps
npm run dev                        # nodemon server.js on :3001
npm run db:generate                # prisma generate
npm run db:migrate                 # prisma migrate dev (local development)
npm run db:seed                    # seed sample tenant + users
npm run db:studio                  # prisma studio
```

There is **no test runner configured** in either package. Don't fabricate test commands.

## Production environment (this host)

This repo lives on the production server itself. `/var/www/crown` **is** prod; `/var/www/crown-staging` is staging. Treat edits here with the care that implies — see `RUNBOOK.md` for the full runbook.

- Prod backend: PM2 app `crown-backend` on port 3001.
- Staging backend: PM2 app `crown-backend-staging` on port 3002.
- Frontend: Nginx serves `dist/` directly.
- Deploy: `bash scripts/deploy-production.sh` (atomic dist swap, with rollback trap and post-deploy healthcheck).
- DB sync in prod uses **`npx prisma db push`** (not `migrate deploy`) per the runbook.

### Non-obvious build detail
`vite.config.js` sets `build.emptyOutDir: false`, and `scripts/deploy-production.sh` deliberately copies the previous deploy's `assets/*` over the new build before swapping `dist`. **Do not "clean this up."** It exists so that browser tabs already open at deploy time don't crash on dynamic-import 404s when their cached chunk hashes disappear.

## Architecture

### Multi-tenancy
Tenant is resolved on every request by `backend/src/middleware/tenantResolver.js`, which reads:
1. `X-Tenant-Slug` header (frontend sets this from `getTenantSlug()` — see `src/lib/api.js`), or
2. The subdomain (e.g. `mahkota.sembapos.com` → `mahkota`). Reserved subdomains (`www`, `app`, `api`, `localhost`) are skipped.

Subscribed tenants populate `req.tenant`. Suspended tenants are **globally 403'd** in `server.js` except for `/api/auth/*`, `/api/tenants/resolve`, and health endpoints — so suspended users can still see the suspension message.

Cross-tenant safety is enforced by `requireTenant` (in `backend/src/middleware/auth.js`): non-super-admin users can only access data where `req.user.tenantId` matches the resolved tenant. `super_admin` bypasses this. Most route handlers also defensively scope queries by `req.user.tenantId` when the user is not super_admin.

### Auth flow
- JWT: 15-minute access token + 7-day refresh token.
- Backend: `authenticate` middleware verifies the access token and **re-fetches the user from DB** every request to honor `isActive`/`deletedAt` immediately.
- Frontend: axios interceptor in `src/lib/api.js` transparently refreshes on 401 and queues concurrent failures during refresh. Logout fires only when refresh returns **400 or 401** — transient 429/5xx/network errors keep the session alive (intentional; do not "fix" by logging out on every refresh failure).
- A custom `auth:logout` window event is the single source of truth for client-side logout; `App.jsx` wires it to `navigate('/login')`.

### Roles & routing
Five roles in `Role` enum: `super_admin`, `tenant_admin`, `kasir`, `barber`, `customer`. Frontend pages are organized by role under `src/pages/{super-admin,tenant-admin,kasir,barber,customer}`. `ProtectedRoute` in `App.jsx` redirects mismatched roles to **their own home**, not `/login` (`roleHomePath` helper). `kasir` home is `/${branchId}/kasir/pos` — branchId is part of the URL.

### Rate limiting
Two limiters mounted in `server.js`:
- General `/api`: 1200/15m prod, 2000/15m dev. **Skips `/auth/me` and `/auth/refresh`** because dashboards poll heavily and would otherwise hit 429.
- `/api/auth/login` and `/api/auth/refresh`: 15/15m prod (strict), 100/15m dev. Note that `/auth/refresh` is in **both** lists — the strict limiter applies on top.

### Realtime
Socket.io shares the HTTP server (`backend/src/config/socket.js`). Rooms:
- `branch:<id>` — POS/queue events for one branch.
- `tenant:<id>` — tenant-wide dashboards.
- `user:<id>` — personal notifications (e.g. ticket replies).
- `support` — all `super_admin` connections auto-join this for ticket events.

Authentication is via the same access token (passed in `socket.handshake.auth.token`).

### Prisma schema
`backend/prisma/schema.prisma` (~440 lines). Conventions:
- All IDs are `cuid()`.
- Soft delete via nullable `deletedAt` on most tenant-scoped models — queries should filter `deletedAt: null`.
- `Queue.serviceNames` is a pipe-separated denormalized string (intentional, see comment in schema).

### WhatsApp integration
`backend/src/services/whatsappService.js` uses `whatsapp-web.js`. **State lives on disk**, not in the DB:
- `backend/storage/whatsapp-settings.json` — per-tenant config.
- `backend/storage/wa-sessions/` — Puppeteer/WA-web auth sessions.

These directories are gitignored and persist across deploys. Per-tenant `Client` instances are kept in an in-memory `Map`, so they reset on PM2 restart and need to re-authenticate (QR scan) only if the session files are missing.

## Frontend conventions

- **Server state** → React Query hooks in `src/hooks/use*.js`. `queryClient` in `src/lib/queryClient.js`.
- **Client state** → Zustand stores in `src/store/`. `authStore` is the auth source-of-truth and caches the user in localStorage (key `barberos_cached_user`) for fast first paint.
- **API client** → always import from `src/lib/api.js`. It attaches the access token and `X-Tenant-Slug` header automatically.
- **Pages are lazy-loaded** in `App.jsx` via `React.lazy`. When adding a new page, follow the existing import + route block pattern so it splits into its own chunk.
- **i18n** via `react-i18next`; UI text is mostly Indonesian.
- Tokens are stored in `localStorage` under `barberos_access_token` / `barberos_refresh_token`.

## Things to watch out for

- `npm install` without `--legacy-peer-deps` will fail (peer-dep mismatches between react-i18next and React 18).
- `lucide-react@^1.8.0` is pinned to a very old major; don't auto-upgrade without checking icon imports.
- Don't add `emptyOutDir: true` to vite config or strip the asset-copy step from `deploy-production.sh` (see "Non-obvious build detail" above).
- Don't tighten the refresh-token error handling in `src/lib/api.js` — the asymmetric handling (logout on 400/401, persist on others) is deliberate.
