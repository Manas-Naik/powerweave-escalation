# Smart Task Escalation Engine — Powerweave

## Capability Overview

The **Smart Task Escalation Engine** is a backend-driven feature built into the Powerweave platform that automatically detects overdue tasks, escalates them through configurable rule sets, notifies the appropriate managers, and maintains a full audit trail of all escalation events. It enforces role-based permissions so only authorised personnel can trigger, view, or resolve escalations.

| Capability | Description |
|---|---|
| Overdue Detection | Cron-based scheduler scans tasks past their due date |
| Auto-Escalation | Rule engine promotes tasks to escalated status with severity tiers |
| Manager Notification | Email + in-app alerts sent to role-matched managers |
| Role-Based Permissions | RBAC enforced at API and service layer |
| Audit Logging | Immutable log of every escalation event |

## Business Objective

Reduce task SLA breaches at Powerweave by ensuring no overdue task goes unnoticed beyond a configurable grace period. Provide management with real-time visibility into escalation status and historical data for process improvement.

## Technology Stack

- **Frontend:** React + Next.js (App Router)
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (via Prisma ORM)
- **Testing:** Playwright (E2E) + Jest (Unit)
- **Cloud:** AWS (ECS Fargate, RDS, SES, SNS)
- **CI/CD:** GitHub Actions

## Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "prisma": "^5.10.0",
    "@prisma/client": "^5.10.0",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.3",
    "nodemailer": "^6.9.9",
    "node-cron": "^3.0.3",
    "zod": "^3.22.4",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "@playwright/test": "^1.42.0",
    "supertest": "^6.3.4",
    "ts-jest": "^29.1.2",
    "typescript": "^5.3.3"
  }
}
```

## Setup Instructions

### Prerequisites

- Node.js >= 18.x
- PostgreSQL >= 15
- AWS CLI configured (for SES/SNS in production)
- Docker (optional, for local DB)

### Local Database (Docker)

```bash
docker run --name powerweave-pg \
  -e POSTGRES_PASSWORD=localpass \
  -e POSTGRES_DB=powerweave_dev \
  -p 5432:5432 -d postgres:15
```

### Environment Variables

```bash
cp .env.example .env
# Fill in values:
# DATABASE_URL=postgresql://postgres:localpass@localhost:5432/powerweave_dev
# JWT_SECRET=your_jwt_secret_here
# AWS_REGION=ap-south-1
# SES_FROM_EMAIL=no-reply@powerweave.io
# ESCALATION_GRACE_MINUTES=30
# CRON_SCHEDULE="*/5 * * * *"
```

### Install & Migrate

```bash
npm install
npx prisma migrate dev --name init
npx prisma generate
```

## Quickstart Guide

```bash
# 1. Clone repository
git clone https://github.com/powerweave/escalation-engine.git
cd escalation-engine

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env  # edit values

# 4. Run database migrations
npx prisma migrate dev

# 5. Seed test data
npm run db:seed

# 6. Start development server
npm run dev
# API available at http://localhost:3001

# 7. Run tests
npm test

# 8. Run E2E tests
npx playwright test
```

## Project Structure

```
src/
├── controllers/      # Route handlers
├── services/         # Business logic
├── models/           # Prisma schema & types
├── middleware/        # Auth, RBAC, error handling
├── routes/           # Express router definitions
└── utils/            # Logger, validators, helpers
tests/
├── unit/             # Jest unit tests
└── e2e/              # Playwright E2E tests
docs/                 # Architecture & planning docs
api-schema/           # YAML API definitions
```
