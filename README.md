# TaskFlow — Backend

Multi-tenant project management API. Node.js/Express, PostgreSQL (Prisma), Redis + BullMQ.

## Quick start

```bash
git clone https://github.com/SanketGamer/Task_flow.git
cd taskflow
cp .env.example .env          # fill in real secrets for JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
docker compose up --build
```

- API: `http://localhost:3000`
- Postgres: `localhost:5432` (user/pass/db: `taskflow` / `taskflow_dev_pw` / `taskflow_dev`)
- Redis: `localhost:6379`

The `api` container runs `prisma migrate deploy` automatically on boot before starting the server — no manual migration step needed for a fresh `docker compose up`.

To seed sample data (2 orgs, 5 users, 4 projects, 14 tasks):
```bash
docker compose exec api npx prisma db seed
```

### Running without Docker

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run dev          # API on :3000
npm run dev:worker   # in a second terminal — email worker
```

Requires a local PostgreSQL and Redis reachable at the URLs in `.env`.

## Environment variables

| Variable | Purpose | Example |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | `postgresql://taskflow:pw@localhost:5432/taskflow_dev` |
| `REDIS_HOST` / `REDIS_PORT` | Redis connection | `localhost` / `6379` |
| `JWT_ACCESS_SECRET` | Signs 15-min access tokens | (generate a random 32+ char string) |
| `JWT_REFRESH_SECRET` | Reserved — refresh tokens are opaque, not JWTs (see below) | — |
| `JWT_ACCESS_TTL` | Access token lifetime | `15m` |
| `JWT_REFRESH_TTL` | Refresh token lifetime | `7d` |
| `BCRYPT_COST` | Password hash cost factor | `12` |

## Architecture

```
                          ┌─────────────┐
   HTTP clients ────────▶ │  Express API │
                          └──────┬──────┘
                                 │ Route → Controller → Service → Repository
                                 ▼
                    ┌────────────────────────┐
                    │  Postgres (via Prisma)  │
                    └────────────────────────┘
                                 │
                                 │ on task assignment
                                 ▼
                    ┌────────────────────────┐
                    │   BullMQ (Redis)         │──▶ Worker process ──▶ mock email send
                    │   email-notifications    │      (retries: 1s→2s→4s backoff,
                    │   queue                  │       dead-letter queue on exhaustion)
                    └────────────────────────┘
```

**Layering (Route → Controller → Service → Repository)**: routes only map HTTP verb+path to a controller; controllers parse requests and shape responses but hold no business logic; services hold all business rules and depend only on repository *interfaces* (ports), never on Prisma directly; repositories are the only layer that speaks Prisma/SQL. This is a ports-and-adapters (hexagonal) structure — every service can be unit-tested against an in-memory fake repository with zero database involved, which is how most of this project's 70 automated tests run.

```
src/
├── modules/{auth,projects,tasks,jobs}/   feature modules, each with
│                                          controller + routes + service (+ repository)
├── types/                                repository interfaces (ports)
├── middleware/                           authGuard, rate limiter, error handler
├── jobs/                                 BullMQ queue, worker, worker entrypoint
├── validators/                           Zod schemas
└── config/                               env validation, Prisma client singleton
```

## Data model

7 required tables (`users`, `organizations`, `org_members`, `projects`, `tasks`, `task_assignments`, `comments`) plus `refresh_tokens` (needed for DB-backed revocation, not in the original table list but required by the auth spec).

**Cascade/restrict decisions** (`prisma/schema.prisma`):
- **Ownership chains → CASCADE**: `Organization → Project → Task → {TaskAssignment, Comment}`. Deleting a parent in an ownership chain removes its children — there's no reason for an orphaned project once its org is gone.
- **Person references → RESTRICT**: `TaskAssignment → User` and `Comment → User (author)`. Deleting a user must not silently erase assignment/authorship history. In practice this means "delete a user" should be a deactivation, not a hard delete, once they have any activity.
- **Soft delete** (bonus): `projects.deletedAt` / `tasks.deletedAt`. Application queries filter `deletedAt: null`; nothing is ever hard-deleted via the API.

## Key technical decisions

- **Registration creates a new organization.** Every resource is org-scoped, so a new user needs an org. `POST /auth/register` creates both, making the registrant `org_admin`. There's no invite-flow endpoint (out of scope for the listed requirements) — adding a second user to an existing org isn't currently exposed over HTTP.
- **Refresh tokens are opaque random strings, hashed (SHA-256) before storage — not JWTs.** DB-backed revocation is required regardless of token format, so there's no stateless benefit to a JWT refresh token, and an opaque token can't leak `orgId`/`role` claims if intercepted. Refresh tokens **rotate** on every use (bonus requirement): the presented token is revoked immediately and a new pair issued, so a replayed stolen token fails once the legitimate client has rotated.
- **403 vs 404 for cross-tenant access is deliberate and asymmetric from the common pattern.** Repositories fetch by primary key *without* an org filter; the service layer then checks `resource.orgId === callerOrgId` and throws 404 (doesn't exist) or 403 (exists, wrong org) accordingly, per the spec's explicit requirement. This is the opposite of the more common "always 404 to avoid confirming existence" convention — followed here because the spec asks for it directly.
- **`orgId` never comes from the client.** It's set once by `authGuard` middleware from the verified JWT payload (`req.auth.orgId`) and every service method takes it as an explicit parameter from there — never from `req.body`/`req.params`/`req.query`.
- **Job-enqueue consistency strategy (Task 04).** The task assignment is persisted first; enqueueing the email job happens after, in a try/catch. If Redis/BullMQ is unreachable, the error is logged and the assignment request still returns success — reversing an already-persisted assignment is riskier than a missed/delayed notification email, which can be reconciled separately.
- **Dead-letter queue.** The worker listens for BullMQ's `failed` event; once `attemptsMade` reaches the configured `attempts` (4 = 1 initial + 3 retries), the job payload and error are pushed onto a separate `email-notifications-dlq` queue, and `GET /jobs/:id` reports the original job's status as `failed`.
- **Pagination is offset-based** (`{ data, total, page, limit }`), per the spec's first option. Query params are permissive — an invalid `?page=` falls back to the default rather than 400ing the request; `limit` is capped at 100 to prevent unbounded result sets.

## API surface

Full interactive docs at `http://localhost:3000/docs` (Swagger UI, reading `src/docs/openapi.json`).
Postman collection: `postman_collection.json` at repo root — import it, run **Auth → Register** first (auto-captures `accessToken`/`refreshToken` into collection variables), then everything else just works.

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | Creates user + new org, returns tokens |
| POST | `/auth/login` | |
| POST | `/auth/refresh` | Rotates the refresh token |
| POST | `/auth/logout` | Body: `{ refreshToken, allDevices? }` |
| POST | `/projects` | |
| GET | `/projects` | Paginated |
| GET | `/projects/:id` | |
| PATCH | `/projects/:id` | |
| DELETE | `/projects/:id` | `org_admin` only |
| GET | `/projects/:id/dashboard` | Task counts by status |
| POST | `/projects/:projectId/tasks` | |
| GET | `/projects/:projectId/tasks` | Filters: `status`, `priority`, `assignee`, `dueFrom`, `dueTo`; paginated |
| GET | `/tasks/:id` | |
| PATCH | `/tasks/:id` | |
| DELETE | `/tasks/:id` | |
| POST | `/tasks/:id/assignments` | Body: `{ userId }` — must be same-org |
| DELETE | `/tasks/:id/assignments/:userId` | |
| GET | `/jobs/:id` | Email job status: pending/active/completed/failed |
| GET | `/health` | |

All auth-protected routes require `Authorization: Bearer <accessToken>`. `/auth/*` is rate-limited to 10 req/min/IP.

## Testing

```bash
npm test              # 70 tests: unit (service logic against fake repos) + integration (supertest)
npm run test:coverage
```

Test isolation strategy: unit tests use in-memory fake repositories (no database at all); integration tests use the same fakes injected through `buildApp()`'s dependency-injection interface, so no shared database state exists between test runs.

## Known gaps (documented, not hidden)

- Full-text search and bulk task status update (bonus items) — not implemented.
- Assignment-deduplication-within-5s and global email rate limit (bonus items) — not implemented.
- No invite-flow endpoint to add a member to an *existing* org (every registration creates a new org).
- OpenAPI/Swagger and Postman/Bruno collection — in progress.
