# QueueUp API

> Virtual queue management platform — NestJS backend

## Technology Stack

| Component | Technology | Version |
|---|---|---|
| Runtime | Node.js | 22 LTS |
| Framework | NestJS | 11.x |
| Language | TypeScript | 5.7 |
| ORM | Prisma | 6.x (stable) |
| Database | Neon PostgreSQL | — |
| Real-time | Socket.IO | 4.x (Phase 5) |
| Docs | Swagger / OpenAPI | — |

---

## Prerequisites

- Node.js v22 LTS
- A [Neon](https://neon.tech) PostgreSQL project with at least one database
- npm (no yarn/pnpm)

---

## Local Development Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd QueueUp-API
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and replace the placeholder values with your real Neon connection strings and secrets:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Neon dashboard → Connection Details → **Pooled** connection string |
| `DIRECT_URL` | Neon dashboard → Connection Details → **Direct** connection string |
| `JWT_SECRET` | Run: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `JWT_REFRESH_SECRET` | Same as above (use a **different** value) |

> ⚠️ **Never commit `.env`**. It is listed in `.gitignore`.

### 3. Generate Prisma Client

```bash
npm run prisma:generate
```

### 4. Apply the database schema

> This creates tables in your Neon database. It will NOT run against production — the `DIRECT_URL` is used to bypass PgBouncer during migration.

```bash
npm run db:migrate:dev
# When prompted, enter a migration name e.g. "initial_schema"
```

### 5. Seed development data

```bash
npm run db:seed
```

Creates 1 clinic, 2 doctors, 1 admin, and 1 staff user (see `prisma/seed.ts`).

### 6. Start the development server

```bash
npm run start:dev
```

The API is available at: `http://localhost:3000/api/v1`  
Swagger UI at: `http://localhost:3000/docs`  
Health check: `http://localhost:3000/api/v1/health`

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run start:dev` | Hot-reload dev server |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start:prod` | Run compiled production build |
| `npm test` | Run unit tests (Jest) |
| `npm run test:cov` | Run tests with coverage report |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run lint` | ESLint with auto-fix |
| `npm run format` | Prettier format |
| `npm run prisma:generate` | Regenerate Prisma Client |
| `npm run prisma:validate` | Validate schema.prisma |
| `npm run db:migrate:dev` | Create + apply migration (dev) |
| `npm run db:migrate:deploy` | Apply migrations via DIRECT_URL (CI/prod) |
| `npm run db:seed` | Seed development data |
| `npm run db:studio` | Open Prisma Studio GUI |

---

## Project Structure

```
src/
├── config/           # Zod env validation
├── database/         # PrismaService (global)
├── health/           # GET /api/v1/health
│
│   ── Phase 2 onwards ──
├── auth/             # OTP + JWT auth
├── users/            # Patient profile, dependents
├── clinics/          # Clinic CRUD, staff membership
├── doctors/          # Doctor CRUD
├── queues/           # DailyQueue lifecycle
├── tokens/           # Booking, state transitions
├── queue-engine/     # Pure domain logic (no DB calls)
├── service-logs/     # Service duration records
├── gateway/          # Socket.IO WebSocket gateway
└── notifications/    # FCM push notifications

prisma/
├── schema.prisma     # Database schema (source of truth)
├── seed.ts           # Development seed data
└── migrations/       # Applied migration history
```

---

## API Documentation

Swagger UI is available at `/docs` in `development` mode only.

In production, generate the OpenAPI JSON during CI and host it separately.

---

## Database Configuration

- **`DATABASE_URL`** — Neon pooled (PgBouncer) connection. Used by the application for all runtime queries. Include `?pgbouncer=true&connection_limit=10`.
- **`DIRECT_URL`** — Neon direct connection. Used by `prisma migrate` only. Do NOT add `pgbouncer=true` — Prisma migrations require prepared statements.

### Running migrations in CI / production

```bash
# Use the direct URL for migrations (bypasses PgBouncer)
DATABASE_URL=$DIRECT_URL npx prisma migrate deploy

# Then start the app (uses pooled URL from DATABASE_URL)
node dist/main
```

---

## OTP Provider Integration Point (D-04)

OTP delivery is intentionally deferred. The `OtpProvider` abstraction lives in `src/auth/otp/` (Phase 2).

To integrate a provider:
1. Set `OTP_PROVIDER` in `.env` to one of: `twilio | msg91 | fast2sms | sns`
2. Set `OTP_API_KEY` to the provider's API key
3. Implement the provider class in `src/auth/otp/providers/`

In `NODE_ENV=development`, OTPs are returned in the API response body and no SMS is sent. This mode is **blocked at startup** in `NODE_ENV=production`.

---

## Security Notes

- `.env` is git-ignored and must never be committed
- JWT secrets must be ≥ 32 characters (enforced at startup by Zod validation)
- Phone numbers are masked in all public-facing API responses
- OTP brute-force protection: max 5 attempts per 10 minutes (Phase 2 — `@nestjs/throttler`)
- Staff endpoints require a valid JWT with `role: STAFF` and clinic membership validation

---

## Implementation Phases

| Phase | Status | Contents |
|---|---|---|
| 0 | ✅ Done | Architecture plan, PRD analysis, decision register |
| 1 | ✅ Done | NestJS scaffold, Prisma schema, health endpoint, env validation |
| 2 | ⏳ Pending | Auth (OTP + JWT), guards, decorators |
| 3 | ⏳ Pending | Clinics, Doctors, Queue lifecycle |
| 4 | ⏳ Pending | Tokens, booking engine, all state transitions |
| 5 | ⏳ Pending | Socket.IO Gateway, real-time events |
| 6 | ⏳ Pending | Patient profiles, dependents |
| 7 | ⏳ Pending | Swagger polish, rate limiting, security hardening |
| 8 | ⏳ Pending | E2E tests, performance baseline |
