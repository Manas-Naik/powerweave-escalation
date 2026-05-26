# Architecture Design Document
# Smart Task Escalation Engine — Powerweave

**Version:** 1.0
**Date:** 2025-01-15
**Status:** Draft — Pending ARB Review

---

## 1. System Overview

The Smart Task Escalation Engine is a backend subsystem embedded within the Powerweave modular monolith. Its responsibility is to detect tasks that have breached their SLA due date, escalate them through a rule-based tier system, notify the responsible managers, and log all state transitions for audit purposes.

The engine operates via:
- A **cron-based scheduler** that polls for overdue tasks every 5 minutes
- A **rule engine** that determines escalation tier (L1 → L2 → L3) based on overdue duration
- A **notification service** that dispatches email (AWS SES) and in-app alerts
- An **RBAC middleware** that controls who can view, trigger, or resolve escalations

```
┌─────────────────────────────────────────────────┐
│               Powerweave Platform                │
│                                                 │
│  ┌──────────┐    ┌──────────────────────────┐   │
│  │ Next.js  │◄───►  Express REST API (Node) │   │
│  │ Frontend │    │  /api/v1/escalations      │   │
│  └──────────┘    └────────────┬─────────────┘   │
│                               │                 │
│  ┌────────────────────────────▼──────────────┐  │
│  │         Escalation Module                 │  │
│  │  ┌─────────────┐  ┌──────────────────┐   │  │
│  │  │ Rule Engine │  │ Notification Svc │   │  │
│  │  └──────┬──────┘  └────────┬─────────┘   │  │
│  │         │                  │             │  │
│  │  ┌──────▼──────────────────▼──────────┐  │  │
│  │  │         PostgreSQL (RDS)           │  │  │
│  │  │  tasks | escalations | audit_logs  │  │  │
│  │  └───────────────────────────────────┘  │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │   Cron Scheduler (node-cron, 5 min)      │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
                         │
        ┌────────────────┴──────────────────┐
        │           AWS Services             │
        │  SES (Email)   SNS (Push/Webhook)  │
        └────────────────────────────────────┘
```

---

## 2. Modular Monolith Structure

The system is a **modular monolith**: a single deployable Node.js application partitioned into cohesive domain modules with strict internal boundaries. This avoids microservice operational overhead while preserving domain separation.

```
src/
├── modules/
│   ├── escalation/           ← Core domain
│   │   ├── escalation.controller.ts
│   │   ├── escalation.service.ts
│   │   ├── escalation.repository.ts
│   │   └── escalation.types.ts
│   ├── notification/
│   │   ├── notification.service.ts
│   │   └── notification.templates.ts
│   ├── audit/
│   │   └── audit.logger.ts
│   └── auth/
│       ├── auth.middleware.ts
│       └── rbac.guard.ts
├── shared/
│   ├── errors/
│   ├── validators/
│   └── config/
└── scheduler/
    └── escalation.cron.ts
```

**Module Rules:**
- Modules communicate only via exported service interfaces (never direct repository cross-calls)
- Shared utilities live in `src/shared/` only
- Database access is isolated per module's repository layer

---

## 3. Data Flow

### 3a. Automated Escalation Flow (Cron)

```
[Cron Trigger every 5 min]
        │
        ▼
[EscalationScheduler.run()]
        │
        ▼
[TaskRepository.findOverdueTasks(gracePeriodMinutes)]
        │
        ▼
[RuleEngine.evaluate(task)] ──► Determine Tier (L1/L2/L3)
        │
        ▼
[EscalationService.create(task, tier)]
        │
        ├──► [EscalationRepository.insert()] ──► PostgreSQL
        │
        ├──► [AuditLogger.log(ESCALATION_CREATED)]
        │
        └──► [NotificationService.dispatch(escalation)]
                    │
                    ├──► AWS SES (Email to manager)
                    └──► In-app notification record
```

### 3b. Manual API Flow (User-Triggered)

```
[HTTP POST /api/v1/escalations]
        │
        ▼
[AuthMiddleware] ──► Validate JWT ──► Decode user + role
        │
        ▼
[RBACGuard] ──► Check permission: CAN_ESCALATE
        │
        ▼
[EscalationController.create()]
        │
        ▼
[Zod Schema Validation]
        │
        ▼
[EscalationService.create()]
        │ (same as above from this point)
```

---

## 4. Frontend ↔ Backend Interaction

| Concern | Approach |
|---|---|
| Communication | REST over HTTPS; JSON payloads |
| Authentication | JWT Bearer token in `Authorization` header |
| State Management | React Query (TanStack Query) for server state |
| Real-time updates | Polling every 30s for escalation status (WebSocket in v2 roadmap) |
| Error handling | Standardised API error envelope: `{ error: { code, message, details } }` |
| API versioning | URL-based: `/api/v1/` prefix; v2 added when breaking change needed |

Next.js API routes act as a **BFF (Backend for Frontend)** layer for page-level data fetching, while direct Express API calls are made for mutations (create, update escalation).

---

## 5. Authentication Approach

**Strategy:** Stateless JWT with RBAC

```
┌──────────┐    POST /auth/login     ┌───────────────┐
│  Client  │ ──────────────────────► │  Auth Service │
│          │ ◄────────────────────── │               │
│          │   { token, expiresIn }  └───────────────┘
│          │
│          │    GET /api/v1/escalations
│          │    Authorization: Bearer <token>
│          │ ──────────────────────► ┌───────────────┐
│          │                         │ AuthMiddleware │
│          │                         │ Verifies JWT  │
│          │                         │ Decodes role  │
│          │                         └──────┬────────┘
│          │                                │
│          │                         ┌──────▼────────┐
│          │ ◄────────────────────── │ RBAC Guard    │
└──────────┘   200 OK / 403 Forbidden│ Checks perm.  │
                                     └───────────────┘
```

**Roles defined:**

| Role | Permissions |
|---|---|
| `ADMIN` | Full access — create, view, update, resolve all escalations |
| `MANAGER` | View and resolve escalations in their team scope |
| `DEVELOPER` | View own task escalations only |
| `VIEWER` | Read-only access to escalation history |

Token payload: `{ sub: userId, role, teamId, iat, exp }`
Token TTL: 1 hour; Refresh token TTL: 7 days

---

## 6. Database Entities

```sql
-- Core task reference
tasks (id, title, assigned_to, due_date, status, team_id, created_at)

-- Escalation record
escalations (
  id UUID PRIMARY KEY,
  task_id UUID REFERENCES tasks(id),
  status ENUM('OPEN','IN_PROGRESS','RESOLVED','CLOSED'),
  tier ENUM('L1','L2','L3'),
  escalated_by UUID REFERENCES users(id),
  assigned_manager UUID REFERENCES users(id),
  reason TEXT,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
)

-- Notification log
notifications (
  id UUID PRIMARY KEY,
  escalation_id UUID REFERENCES escalations(id),
  channel ENUM('EMAIL','IN_APP'),
  recipient_id UUID REFERENCES users(id),
  sent_at TIMESTAMP,
  status ENUM('SENT','FAILED','PENDING')
)

-- Immutable audit trail
escalation_audit_logs (
  id UUID PRIMARY KEY,
  escalation_id UUID REFERENCES escalations(id),
  action ENUM('CREATED','STATUS_CHANGED','NOTIFIED','RESOLVED'),
  performed_by UUID REFERENCES users(id),
  old_value JSONB,
  new_value JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
)
```

**Indexes:**
- `tasks(due_date, status)` — cron query performance
- `escalations(task_id)`, `escalations(status, created_at)` — common queries
- `escalation_audit_logs(escalation_id, timestamp)` — history lookups

---

## 7. External Integrations

| Integration | Purpose | Approach |
|---|---|---|
| **AWS SES** | Email notifications to managers | `@aws-sdk/client-ses` with HTML templates |
| **AWS SNS** | Webhook/push for downstream systems | SNS topic per escalation tier |
| **AWS RDS (PostgreSQL)** | Production database | Prisma ORM with connection pooling (PgBouncer) |
| **AWS ECS Fargate** | Container hosting | Docker image deployed via GitHub Actions |
| **AWS CloudWatch** | Application logging | Winston transport → CloudWatch Logs |

All AWS credentials are injected via ECS Task Role (no static credentials stored in code or environment files in production).

---

## 8. Build vs Buy Decisions

| Component | Decision | Rationale |
|---|---|---|
| **Email Service** | **Buy** — AWS SES | Cost-effective at scale, high deliverability, no operational burden vs self-hosted Postfix |
| **ORM** | **Buy** — Prisma | Type-safe migrations, excellent PostgreSQL support; building custom query builder is waste |
| **Auth (JWT library)** | **Buy** — `jsonwebtoken` | RFC-compliant, audited; no need for full identity provider at this scale |
| **Full Auth Platform** | **Build** (not Auth0/Cognito) | Powerweave already has user accounts; SSO not required in v1; avoids per-MAU pricing |
| **Job Scheduler** | **Buy** — `node-cron` | Simple cron expression, zero infra; no need for Bull/BullMQ until job volume > 10k/day |
| **Notification Hub** | **Build** | Custom recipient resolution logic (role-based team scope) not supported out-of-box by commodity notification services |
| **API Framework** | **Buy** — Express | Mature, well-understood; team proficiency high; no benefit switching to Fastify at current scale |
| **Testing (E2E)** | **Buy** — Playwright | Best-in-class cross-browser E2E; building custom test harness would take weeks |
