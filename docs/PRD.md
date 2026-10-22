# Product Requirement Document (PRD)

## Project: Lightweight Virtual Queue Management Platform
* **Architecture:** Monorepo / Decoupled Client-Server
* **Backend:** NestJS (TypeScript), Prisma ORM, Socket.IO Gateway
* **Database:** Neon PostgreSQL (Serverless Postgres with Connection Pooling)
* **Frontend:** React Native (Expo) for Mobile (Patient) & Tablet/Desktop Web (Staff Console), Nativewind
* **State Management:** TanStack/Zustand
* **Target Users:** Patients / Visitors & Front Desk / Clinic Operators

---

## 1. Executive Summary & Core Objectives

Traditional physical queue systems create crowded waiting areas, increase contagion risk, and produce high patient anxiety. Fixed appointment slots break down because consultation lengths vary unpredictably. 

This platform delivers a dynamic, event-driven virtual queue that:
1. Provides patients with dynamic, rolling ETAs and milestone alerts so they arrive just in time.
2. Gives front-desk operators simple one-click controls for calling patients, handling diagnostic test holds, managing no-shows, and broadcasting sudden delays.
3. Keeps technical complexity minimal by utilizing fractional indexing for $O(1)$ queue re-ordering in PostgreSQL without batch row updates.

---

## 2. Core Queue Algorithms & Business Logic

### 2.1 Fractional Indexing (`queuePosition: Float`)
To avoid running expensive cascading updates on hundreds of rows when moving or inserting patients:
* **Booking at end of queue:**
  $$\text{Position}_{\text{new}} = \max(\text{queuePosition}) + 100.0$$
* **Inserting between two tokens ($A$ and $B$):**
  $$\text{Position}_{\text{new}} = \frac{\text{Position}_A + \text{Position}_B}{2.0}$$

### 2.2 Diagnostic Report Re-Entry ("Inject 2 Slots Down")
When a doctor sends a patient for diagnostic scans, X-rays, or blood tests:
1. Staff marks the token as `HOLD_SCAN`. The token is detached from the active count and the consultation room is freed.
2. When the patient returns with reports, staff clicks **"Return from Scan"**.
3. The system queries upcoming `WAITING` tokens ordered by `queuePosition ASC`:
   * If $\ge 3$ tokens are waiting: Injected between waiting token #2 and #3.
   * If exactly 2 tokens are waiting: Assigned position $\text{pos}_2 + 50.0$.
   * If $< 2$ tokens are waiting: Assigned $\max(\text{queuePosition}) + 100.0$ (end of line).
4. Status transitions back to `WAITING`.

### 2.3 "Step Aside" / "Running Late"
Patients can self-manage minor transit delays:
* Allowed strictly **once per token** (`stepAsideUsed = true`).
* Automatically calculates fractional position between the 3rd and 4th waiting tokens behind them.
* Re-emits updated positions and recalculates dynamic ETAs for all subsequent patients.

### 2.4 Rolling Service Time Average & Dynamic ETA
$$\text{Rolling Average} = \frac{\sum_{i=1}^{5} \text{Duration of last 5 completed consultations}}{5}$$

$$\text{Patient ETA (Minutes)} = (\text{Tokens Ahead}) \times \left( \frac{\text{Doctor Avg Service Seconds}}{60} \right) + \text{Queue Delay Offset}$$

* Consultations under 30 seconds are filtered out as accidental completions.
* Baseline default: 10 minutes (600 seconds) if fewer than 3 consultations have completed in the current session.

---

## 3. Backend System PRD (NestJS + Neon PostgreSQL)

### 3.1 Neon Database Architecture
* Connect via **Neon Pooled Connection String** (`-pooler.region.neon.tech`) using PgBouncer for transactional queries.
* Direct URL used strictly for Prisma schema migrations.
* Concurrency isolation: Atomic queue updates (`callNext`, `injectScanReturn`, `stepAside`) execute inside Prisma transactions with row-level locking (`SELECT ... FOR UPDATE`).

### 3.2 Prisma Schema Definition

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  PATIENT
  STAFF
  ADMIN
}

enum TokenStatus {
  WAITING
  SERVING
  HOLD_SCAN
  SKIPPED
  COMPLETED
  CANCELLED
}

enum QueueStatus {
  ACTIVE
  PAUSED
  CLOSED
}

model User {
  id        String   @id @default(uuid())
  phone     String   @unique
  name      String
  role      Role     @default(PATIENT)
  fcmToken  String?
  tokens    Token[]
  createdAt DateTime @default(now())
}

model Clinic {
  id        String   @id @default(uuid())
  name      String
  doctors   Doctor[]
  createdAt DateTime @default(now())
}

model Doctor {
  id                    String       @id @default(uuid())
  clinicId              String
  clinic                Clinic       @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  name                  String
  roomNumber            String
  avgServiceTimeSeconds Int          @default(600)
  dailyQueues           DailyQueue[]
  serviceLogs           ServiceLog[]
  createdAt             DateTime     @default(now())
}

model DailyQueue {
  id              String      @id @default(uuid())
  doctorId        String
  doctor          Doctor      @relation(fields: [doctorId], references: [id], onDelete: Cascade)
  queueDate       DateTime    @db.Date
  status          QueueStatus @default(ACTIVE)
  delayMinutes    Int         @default(0)
  delayReason     String?
  lastTokenNumber Int         @default(0)
  currentTokenId  String?     @unique
  currentToken    Token?      @relation("CurrentServingToken", fields: [currentTokenId], references: [id])
  tokens          Token[]     @relation("QueueTokens")
  createdAt       DateTime    @default(now())

  @@unique([doctorId, queueDate])
}

model Token {
  id             String       @id @default(uuid())
  queueId        String
  queue          DailyQueue   @relation("QueueTokens", fields: [queueId], references: [id], onDelete: Cascade)
  patientId      String?
  patient        User?        @relation(fields: [patientId], references: [id], onDelete: SetNull)
  patientName    String
  phone          String
  tokenNumber    Int
  status         TokenStatus  @default(WAITING)
  queuePosition  Float
  stepAsideUsed  Boolean      @default(false)
  servedAt       DateTime?
  completedAt    DateTime?
  servingInQueue DailyQueue?  @relation("CurrentServingToken")
  serviceLogs    ServiceLog[]
  createdAt      DateTime     @default(now())

  @@index([queueId, queuePosition])
  @@index([queueId, status])
}

model ServiceLog {
  id              String   @id @default(uuid())
  tokenId         String
  token           Token    @relation(fields: [tokenId], references: [id], onDelete: Cascade)
  doctorId        String
  doctor          Doctor   @relation(fields: [doctorId], references: [id], onDelete: Cascade)
  durationSeconds Int
  createdAt       DateTime @default(now())
}
```

### 3.3 NestJS Endpoints Specification

| Method | Route | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/tokens/book` | Public / Patient | Issues sequential token with `queuePosition = max + 100.0`. |
| `POST` | `/api/v1/tokens/:id/step-aside` | Patient | Shifts token back 3 slots (one-time limit). |
| `POST` | `/api/v1/queues/:id/call-next` | Staff | Completes active token, recalculates rolling avg, activates next. |
| `POST` | `/api/v1/tokens/:id/send-to-scan` | Staff | Sets token from `SERVING` to `HOLD_SCAN`. |
| `POST` | `/api/v1/tokens/:id/return-from-scan` | Staff | Injects `HOLD_SCAN` token 2 positions behind active token. |
| `POST` | `/api/v1/tokens/:id/skip` | Staff | Marks token `SKIPPED`, pulls next in line. |
| `POST` | `/api/v1/tokens/:id/recall` | Staff | Re-inserts `SKIPPED` token into 2nd position. |
| `PATCH`| `/api/v1/queues/:id/delay` | Staff | Updates delay offset and broadcasts to queue room. |

### 3.4 WebSocket Gateway Events (`/queue-socket`)
* **Client to Server:**
  * `joinQueueRoom({ queueId })`: Subscribes client to `queue_${queueId}` room.
  * `leaveQueueRoom({ queueId })`: Unsubscribes client.
* **Server to Client Broadcasts:**
  * `queueStateUpdated`: Full queue summary (active token number, count ahead, estimated pace).
  * `milestoneAlert`: Direct push event when user reaches 5th, 2nd, or 1st position.
  * `queueDelayed`: Instant banner update with delay duration and reason.

---

## 4. Frontend PRD (React Native / Expo)

### 4.1 Target Layout & Multi-Role Design
* **Patient App:** Native Mobile view (iOS/Android) emphasizing clear typography, readable distance cards, and dynamic countdowns.
* **Staff Console:** Responsive Tablet/Desktop layout optimized for reception counters with high-contrast, large touch targets ($\ge 48\text{px}$).

### 4.2 Patient Screen Hierarchy

```
[Auth / Login]
       │
       ▼
[Clinic & Doctor Selection] ── (Displays active queues & doctor status)
       │
       ▼
[Token Booking Screen] ────── (Select member: Self / Dependents)
       │
       ▼
[Live Queue Tracker (Hero Screen)]
   ├── Status Banner (Doctor Name, Room Number, Delay Warnings)
   ├── Primary Badge (Now Serving Token # vs Your Token #)
   ├── Metrics (Tokens Ahead, Dynamic Wait Time)
   └── Quick Action: [Running Late? Push 3 Slots] (1-time use)
```

#### Proximity Milestone Alerts:
* **Milestone 1 (5 ahead):** *"You are #5 in line. Please head toward the clinic."*
* **Milestone 2 (2 ahead):** *"You are next up. Please report to the waiting counter."*
* **Milestone 3 (Serving):** *"Token #[X] is now being called in Room [Y]."*

### 4.3 Front Desk / Operator Console Hierarchy

```
[Staff Login]
       │
       ▼
[Operator Live Console]
   ├── Header: Active Doctor, Live Rolling Pace (mins/pt), [Broadcast Delay / Break]
   ├── Active Panel:
   │     ├── Giant Text: CURRENTLY SERVING: TOKEN #X
   │     ├── Live Timer (Duration with current patient)
   │     └── Buttons: [Call Next Patient] | [Skip / No-Show] | [Send for Scan]
   └── Segmented Secondary Drawers:
         ├── Tab 1: Waiting Line (Live list with queue positions)
         ├── Tab 2: Awaiting Scan (Action: [Inject 2 Slots Down])
         └── Tab 3: Skipped List (Action: [Re-Call to Line])
```

---

## 5. Non-Functional Requirements & Guardrails

1. **Propagation Latency:** WebSocket notifications and state transitions must reflect on all active clients in $< 500\text{ms}$.
2. **Neon Connection Safety:** Configure Prisma with strict connection pool sizing matching Neon's PgBouncer parameters (`connection_limit=10` per instance) to avoid pool exhaustion.
3. **Optimistic UI & Reconnects:** Mobile clients waking up from background execution must issue a lightweight query (`GET /tokens/:id/status`) to reconcile any missed WebSocket frames.
4. **Privacy Protection:** Public display modes and shared queues must mask sensitive contact details (`+91 98****1234`), displaying only patient first names and token numbers.