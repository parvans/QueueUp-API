# QueueUp System Architecture & Technical Specification

## 1. System Overview & Architectural Principles

QueueUp is a production-grade virtual queue management platform designed for healthcare facilities, clinics, and outpatient departments. It eliminates physical waiting room congestion and patient anxiety by replacing physical tokens with dynamic virtual tokens, real-time status tracking, rolling ETA calculations, and flexible patient deferrals.

### Core Architectural Principles

1. **Decoupled Client-Server Monorepo:** Clean architectural separation between backend services (NestJS) and client applications (React Native / Expo patient mobile app and staff tablet/desktop console).
2. **Database-First Consistency:** All queue state mutations are persisted and locked inside atomic PostgreSQL transactions before any WebSocket broadcast or notification is triggered.
3. **$O(1)$ Queue Re-Ordering via Fractional Indexing:** Position changes execute in $O(1)$ database updates by assigning fractional floats, avoiding expensive batch row re-writes.
4. **Resilient Connection Architecture:** Strict connection pooling via Neon's PgBouncer for transactional traffic with dedicated direct connections reserved for schema migrations.
5. **Privacy by Design:** Phone numbers and personally identifiable health information are masked at the API gateway layer before public dissemination.

---

## 2. System Topology

```
+-------------------------------------------------------------------------+
|                              CLIENT LAYER                               |
|                                                                         |
|  +----------------------------------+  +-----------------------------+  |
|  |     Patient Mobile App (Expo)    |  | Staff Web Console (Tablet)  |  |
|  |  - Auth / OTP Login              |  | - Staff / Admin Login       |  |
|  |  - Clinic / Doctor Select        |  | - Live Queue Dashboard      |  |
|  |  - Token Booking                 |  | - Call Next / Skip / Scan   |  |
|  |  - Dynamic Live ETA Tracking     |  | - Delay Broadcast           |  |
|  +-----------------+----------------+  +--------------+--------------+  |
+--------------------|----------------------------------|-----------------+
                     | HTTP / REST (/api/v1)            |
                     | WebSocket (/queue-socket)        |
+--------------------v----------------------------------v-----------------+
|                           APPLICATION LAYER                             |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  |                           NestJS Engine                           |  |
|  |                                                                   |  |
|  |  +-------------------------+         +-------------------------+  |  |
|  |  |   Core Infrastructure   |         |    Real-Time Gateway    |  |  |
|  |  | - AllExceptionsFilter   |         | - Socket.IO Gateway     |  |  |
|  |  | - TransformInterceptor  |         | - Room: queue_{queueId} |  |  |
|  |  | - LoggingInterceptor    |         | - Event Dispatcher      |  |  |
|  |  +------------+------------+         +------------+------------+  |  |
|  |               |                                   |               |  |
|  |  +------------v-----------------------------------v------------+  |  |
|  |  |                          Modules                            |  |  |
|  |  | - AuthModule (JWT, RBAC, Phone OTP / Staff Password)        |  |  |
|  |  | - ClinicModule & DoctorModule                               |  |  |
|  |  | - DailyQueueModule (State management, Delays)              |  |  |
|  |  | - TokenModule (Booking, Fractional Engine, Rebalancing)     |  |  |
|  |  | - StaffOperationsModule (Call next, Hold scan, Skip)       |  |  |
|  |  | - ETACalculatorModule (Rolling average, Dynamic ETA)      |  |  |
|  |  +--------------------------------+----------------------------+  |  |
|  +-----------------------------------|-------------------------------+  |
+--------------------------------------|----------------------------------+
                                       | Prisma 7 ORM (@prisma/adapter-pg)
+--------------------------------------v----------------------------------+
|                            DATA LAYER                                   |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  |                     Neon Serverless PostgreSQL                    |  |
|  |                                                                   |  |
|  |   Pooled Connection (-pooler): Application queries (max 10)       |  |
|  |   Direct Connection: Schema migrations & introspection            |  |
|  |   Concurrency: Row-level locking (SELECT ... FOR UPDATE)          |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

---

## 3. NestJS Modular Structure & Boundaries

The backend application is decomposed into isolated, single-responsibility modules:

```
src/
├── app.module.ts              # Root composition module
├── main.ts                    # Bootstrap entry point, global pipes, prefix, Swagger
├── core/                      # Cross-cutting foundational infrastructure
│   ├── core.module.ts
│   ├── decorators/            # Custom parameter and route decorators (@BypassTransform, @Roles)
│   ├── filters/               # Centralized exception filters (AllExceptionsFilter)
│   ├── interceptors/          # Response transforms and audit logging
│   └── pipes/                 # Validation pipes
├── prisma/                    # Database provider abstraction
│   ├── prisma.module.ts
│   └── prisma.service.ts      # Prisma Client lifecycle with @prisma/adapter-pg and pg.Pool
├── health/                    # Service health check & ping
│   ├── health.controller.ts
│   └── health.module.ts
├── auth/                      # Authentication & authorization (Phase 2)
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── guards/                # JwtAuthGuard, RolesGuard
│   └── strategies/            # Passport JWT strategy
├── clinic/                    # Clinic and doctor catalog management (Phase 3)
├── queue/                     # Daily queue management and delay broadcasting (Phase 3)
├── token/                     # Token booking, fractional positioning, step aside (Phases 4 & 6)
├── staff-ops/                 # Staff queue mutations: call next, send/return scan (Phase 5)
├── eta/                       # Dynamic ETA and rolling average calculation (Phase 6)
└── gateway/                   # Socket.IO real-time event dispatching (Phase 7)
```

### Module Boundary Rules

1. **Controllers** only handle request mapping, DTO validation, and response routing. They never contain algorithmic queue logic.
2. **Services** contain core business logic and transactional coordination. Services communicate through dependency injection.
3. **Queue Math Independence:** The fractional indexing algorithm, rolling average, and dynamic ETA calculations are isolated in testable pure utility functions/providers with no coupling to HTTP controllers or WebSocket gateways.
4. **Database Access:** Modules access PostgreSQL exclusively through `PrismaService`. Raw SQL is used only when row-level locking (`SELECT ... FOR UPDATE`) is required, using parameterized queries.

---

## 4. Database Architecture & Concurrency Control

### 4.1 Neon PostgreSQL Connection Topology

Neon provides two connection strings:
- **Pooled URL (`DATABASE_URL`):** Connects through Neon's PgBouncer proxy (`-pooler.c-6.us-east-2.aws.neon.tech`). Used exclusively for runtime application queries.
  - Pool size is configured strictly with `max: 10` per application instance to prevent pooler exhaustion.
- **Direct URL (`DIRECT_URL`):** Connects directly to the compute instance. Reserved strictly for Prisma migrations and schema introspection (`prisma migrate deploy / dev`).

### 4.2 Concurrency & Row-Level Locking

Queue state updates (`callNext`, `injectScanReturn`, `stepAside`, and `bookToken`) are susceptible to race conditions under concurrent client requests.

To guarantee linear consistency:
1. Every queue mutation executes inside a **Prisma Interactive Transaction** (`prisma.$transaction`).
2. The active `DailyQueue` record is locked using row-level locking:
   ```sql
   SELECT * FROM "DailyQueue" WHERE id = $1 FOR UPDATE;
   ```
3. Subsequent operations (calculating positions, inserting tokens, rebalancing) run safely within this lock boundary, preventing duplicate token numbers or overlapping position allocations.
4. Transactions are kept lean ($< 50\text{ms}$ execution time) to minimize lock contention.

---

## 5. Core Queue Algorithms & Precision Guards

### 5.1 Fractional Indexing Engine

Each token in a `DailyQueue` has a floating-point `queuePosition` (`DOUBLE PRECISION` in PostgreSQL, `Float` in Prisma).

- **Booking at end of queue:**
  $$\text{Position}_{\text{new}} = \max(\text{queuePosition}) + 100.0$$
  *(If queue is empty, initial position is $100.0$)*
- **Inserting between Token $A$ and Token $B$:**
  $$\text{Position}_{\text{new}} = \frac{\text{Position}_A + \text{Position}_B}{2.0}$$

### 5.2 Floating-Point Precision Safety & Transactional Rebalancing

- **Precision Threshold ($\epsilon$):** IEEE-754 double precision maintains approximately 53 bits of mantissa (~15-17 significant decimal digits). When consecutive midpoints are calculated repeatedly, the gap between adjacent tokens shrinks by $2^{-n}$.
- **Safety Mechanism:** A configurable safety threshold is established:
  $$\Delta = \text{pos}_B - \text{pos}_A$$
  $$\text{If } \Delta < 1 \times 10^{-4} \implies \text{Trigger Transactional Rebalance}$$
- **Rebalancing Procedure:**
  1. Executes inside the locked queue transaction (`FOR UPDATE`).
  2. Queries all non-terminal tokens (`WAITING`, `HOLD_SCAN`) for the queue ordered by `queuePosition ASC`.
  3. Re-assigns positions sequentially:
     $$\text{Token}_i.\text{queuePosition} = (i + 1) \times 100.0 \quad (\text{for } i = 0, 1, 2, \dots)$$
  4. Preserves the strict relative ordering of all tokens.
  5. The new insertion is then placed at the integer midpoint (e.g., $150.0$ between $100.0$ and $200.0$).

### 5.3 Diagnostic Scan Re-entry ("Inject 2 Slots Down")

When staff marks a patient as returning from a diagnostic scan:
1. Retrieve all active `WAITING` tokens in the queue ordered by `queuePosition ASC`.
2. Determine new position:
   - **$\ge 3$ tokens waiting:** Insert between waiting token #2 and #3:
     $$\text{pos}_{\text{new}} = \frac{\text{pos}_2 + \text{pos}_3}{2.0}$$
   - **Exactly 2 tokens waiting:**
     $$\text{pos}_{\text{new}} = \text{pos}_2 + 50.0$$
   - **$< 2$ tokens waiting (0 or 1):** Append to the end:
     $$\text{pos}_{\text{new}} = \max(\text{queuePosition}) + 100.0$$
3. Update token status from `HOLD_SCAN` to `WAITING`.

### 5.4 "Step Aside" / "Running Late" Deferral

Patients are permitted to step aside once per token:
1. Verify `stepAsideUsed === false` and token status is `WAITING`.
2. Query upcoming `WAITING` tokens ordered by `queuePosition ASC`.
3. Locate patient's index $k$ among waiting tokens.
4. Calculate target position:
   - **If $\ge 3$ waiting tokens exist behind the patient ($k+3$ exists):**
     Insert between token $k+3$ and token $k+4$:
     $$\text{pos}_{\text{new}} = \frac{\text{pos}_{k+3} + \text{pos}_{k+4}}{2.0}$$
     *(If $k+4$ does not exist, $\text{pos}_{\text{new}} = \text{pos}_{k+3} + 50.0$)*
   - **If $< 3$ waiting tokens exist behind the patient:**
     Move patient to the end of the queue:
     $$\text{pos}_{\text{new}} = \max(\text{queuePosition}) + 100.0$$
   - **If patient is already the last waiting token:**
     Reject request with HTTP 400 Bad Request (`"Cannot step aside when already at the end of the queue"`).
5. Persist `stepAsideUsed = true`.
6. Recalculate dynamic ETAs and broadcast `queueStateUpdated`.

### 5.5 Rolling Average Service Time & Dynamic ETA

- **Rolling Average Calculation:**
  Query the last 5 completed `ServiceLog` records for the doctor in the active session:
  $$\text{Valid Logs} = \{ \text{log} \mid \text{log.durationSeconds} \ge 30 \}$$
  - If count of valid logs $\ge 3$:
    $$\text{Doctor Avg Service Seconds} = \frac{\sum_{i=1}^{N} \text{durationSeconds}_i}{N} \quad (N \le 5)$$
  - If count of valid logs $< 3$:
    $$\text{Doctor Avg Service Seconds} = 600\text{ seconds (10 minutes baseline default)}$$
- **Dynamic ETA Formula:**
  $$\text{Tokens Ahead} = \text{Count of WAITING tokens with } \text{queuePosition} < \text{Patient.queuePosition}$$
  $$\text{Patient ETA (Minutes)} = (\text{Tokens Ahead}) \times \left( \frac{\text{Doctor Avg Service Seconds}}{60} \right) + \text{Queue Delay Offset}$$

---

## 6. Real-Time Communication Architecture (Socket.IO)

- **Namespace:** `/queue-socket`
- **Room Isolation:** Clients subscribe to dedicated rooms formatted as:
  ```
  queue_{queueId}
  ```

### Event Contracts

| Direction | Event Name | Payload | Description |
| :--- | :--- | :--- | :--- |
| **Client $\to$ Server** | `joinQueueRoom` | `{ queueId: string }` | Joins the specified queue room |
| **Client $\to$ Server** | `leaveQueueRoom` | `{ queueId: string }` | Leaves the specified queue room |
| **Server $\to$ Client** | `queueStateUpdated` | `{ queueId, activeToken, waitingCount, estimatedPace }` | Emitted when queue position or status changes |
| **Server $\to$ Client** | `milestoneAlert` | `{ tokenId, milestone: 5 \| 2 \| 1 \| 'SERVING', message }` | Direct proximity alert to affected patient |
| **Server $\to$ Client** | `queueDelayed` | `{ queueId, delayMinutes, delayReason }` | Real-time banner alert when doctor announces delay |

### Broadcast Guarantees & Reconciliation

1. **Database-First Broadcast:** Events are emitted only *after* Prisma transactions successfully commit.
2. **Reconnection Reconciliation:** If a client disconnects or wakes up from background execution, it issues a lightweight REST query:
   `GET /api/v1/tokens/:id/status`
   to reconcile state against the authoritative database.

---

## 7. API Architecture & Standards

### 7.1 Routing & Versioning
All API endpoints follow the URI pattern:
```
/api/v1/:resource
```
Swagger OpenAPI documentation is exposed at:
```
/api/docs
```

### 7.2 Standardized Success Envelope
Every standard HTTP JSON response is transformed by `TransformInterceptor`:
```json
{
  "success": true,
  "statusCode": 200,
  "data": { ... },
  "timestamp": "2026-11-13T20:34:00.000Z"
}
```

### 7.3 Standardized Error Envelope
Every uncaught error is intercepted by `AllExceptionsFilter`:
```json
{
  "success": false,
  "statusCode": 404,
  "error": "NotFoundException",
  "message": "Token not found",
  "timestamp": "2026-11-13T20:34:00.000Z",
  "path": "/api/v1/tokens/123"
}
```

### 7.4 Special Handling & Interceptor Guards
The global `TransformInterceptor` explicitly passes through without transformation:
1. **Non-HTTP contexts:** WebSocket frames and microservices.
2. **Documentation routes:** Requests starting with `/api/docs`.
3. **Custom bypassed endpoints:** Handlers annotated with `@BypassTransform()`.
4. **Binary & streaming responses:** `StreamableFile`, `Buffer`, or already sent headers.
5. **Pre-formatted responses:** Objects already containing `success` and `data` keys.

---

## 8. Security & Privacy Architecture

### 8.1 Role-Based Access Control (RBAC)

```
                       +-------------------+
                       |    All Requests   |
                       +---------+---------+
                                 |
                                 v
                       +-------------------+
                       |   JwtAuthGuard    |
                       +---------+---------+
                                 |
                                 v
                       +-------------------+
                       |    RolesGuard     |
                       +----+---------+----+
                            |         |
           +----------------+         +----------------+
           |                                           |
           v                                           v
+----------------------+                   +-----------------------+
|  PATIENT Endpoints   |                   |    STAFF / ADMIN      |
|  - Book token        |                   |  - Call next patient  |
|  - View own token    |                   |  - Send to scan       |
|  - Step aside        |                   |  - Return from scan   |
+----------------------+                   |  - Skip / Recall      |
                                           |  - Broadcast delay    |
                                           +-----------------------+
```

### 8.2 Privacy & Data Masking
Public queue displays and non-privileged client responses mask patient contact details:
$$\text{Masked Format: } \texttt{+91 98****1234}$$
Full names are truncated to first names on public waiting board displays.

### 8.3 Authentication Credential Strategy
- **Patients:** Passwordless phone-based OTP authentication (Phase 2).
- **Staff / Admin:** Role-based password authentication using `passwordHash` stored in the `User` table (Phase 2).

---

## 9. Development Environment & Runtime Notes

### Node.js 22 macOS Keychain Investigation

- **Issue:** On macOS running Node v22.x inside restricted or sandboxed environments (such as sandboxed runners, CI containers, or App Sandbox profiles), Node's native crypto module invokes the Apple Security framework API `SecItemCopyMatching` to inspect macOS keychain root certificates. When keychain access is restricted, `SecItemCopyMatching` returns `-50` (`errSecParam`) and triggers a SIGSEGV / crash (exit code 139).
- **Investigation Finding:** Node.js officially provides the flag `--use-bundled-ca` to instruct Node to use its compiled-in Mozilla root CA certificates instead of querying the host OS keychain.
- **Resolution Strategy:**
  - In development and restricted test environments, set `NODE_OPTIONS="--use-bundled-ca"` for testing and development.
  - Production scripts (e.g., `start:prod` running on Linux in containerized or serverless cloud environments) do not include platform-specific flags.

