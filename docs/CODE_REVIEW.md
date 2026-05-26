# CodeRabbit Code Review Simulation
# Smart Task Escalation Engine — PR #142

**Review Tool:** CodeRabbit (AI-Assisted Code Review)
**PR:** `feat(escalation): add smart task escalation engine`
**Review Date:** 2025-01-15

---

## Review Comment 1 — Security Issue

**File:** `src/utils/audit.logger.ts`
**Line:** 52 (inside the `log()` catch block)

### 🤖 CodeRabbit Comment

> **🔴 Security: Sensitive data in error logs**
>
> The catch block logs `err` directly with `console.error`. If `err` contains a database error message that includes query fragments (e.g., column names, partial data values from a failed INSERT), this could leak schema details or PII into application logs.
>
> Additionally, `escalationId` and `action` are logged in plain text. Ensure your log aggregation pipeline (CloudWatch) has appropriate access controls.
>
> **Suggestion:** Use a structured logger (e.g., Winston) with log level filtering and sanitise error messages before logging.

### 👨‍💻 Developer Response

Valid finding. We were planning to add Winston in Sprint 2 but this surfaces a concrete reason to do it now before logs go to CloudWatch in production.

### ✅ Resolution Action

Replaced `console.error` in `audit.logger.ts` with the Winston logger instance:

```typescript
// Before (problematic):
console.error(
  `[AuditLogger] Failed to write audit log for escalation ${escalationId}: ${err}`
);

// After (safe — structured logging with redaction):
logger.error("Audit log write failed", {
  escalationId,       // UUID only — no sensitive content
  action,
  errorCode: err.code ?? "UNKNOWN",
  // err.message intentionally excluded to prevent DB error message leakage
});
```

Winston transport configured with `level: 'error'` for this path; CloudWatch log group has restricted IAM read access (Engineers only, not all developers).

### 📝 Justification

Logging the raw DB error string could expose table/column names to anyone with CloudWatch read access. Logging only the error code (e.g., `P2002` for Prisma unique constraint) gives enough signal for debugging without leaking schema details.

---

## Review Comment 2 — Missing Edge Case

**File:** `src/services/escalation.service.ts`
**Line:** 38 (`createEscalation` — after task lookup)

### 🤖 CodeRabbit Comment

> **🟡 Logic: Missing check — task status not validated before escalation**
>
> The code checks whether a task exists and whether an active escalation already exists, but it does not check whether the task's current `status` allows escalation. For example, a task with `status: 'COMPLETED'` or `status: 'CANCELLED'` should not be escalatable.
>
> Currently, you could escalate a task that was completed 5 minutes ago, creating a confusing audit trail.

### 👨‍💻 Developer Response

Correct catch. This was in the backlog ("validate task state before escalation") but we assumed the cron job would filter it — we didn't think about manual API escalations on already-closed tasks.

### ✅ Resolution Action

Added task status validation after the existence check:

```typescript
// Added between lines 38–42 of escalation.service.ts:
const NON_ESCALATABLE_STATUSES = ["COMPLETED", "CANCELLED", "ARCHIVED"];

if (NON_ESCALATABLE_STATUSES.includes(task.status)) {
  throw new AppError(
    422,
    "TASK_NOT_ESCALATABLE",
    `Task ${taskId} has status ${task.status} and cannot be escalated`
  );
}
```

Added corresponding unit test:

```typescript
it("should throw 422 when task status is COMPLETED", async () => {
  mockPrisma.task.findUnique.mockResolvedValue({
    id: "task-id", status: "COMPLETED", teamId: "team-id", title: "Done task"
  });

  await expect(
    service.createEscalation({ taskId: "task-id", tier: "L1",
      reason: "Attempting to escalate completed task.", escalatedBy: "user-id" })
  ).rejects.toThrow(expect.objectContaining({ code: "TASK_NOT_ESCALATABLE" }));
});
```

### 📝 Justification

Escalating a completed task would produce misleading audit trails and confuse managers who receive notifications about tasks that are already done. The 422 status code is appropriate (request is syntactically valid but semantically unprocessable).

---

## Review Comment 3 — Duplicate Code

**File:** `src/controllers/escalation.controller.ts`
**Lines:** 55–62 and 112–119

### 🤖 CodeRabbit Comment

> **🟡 Maintainability: Duplicated Zod error formatting logic**
>
> The pattern for converting Zod parse failures into AppError `details` arrays appears twice — once in `createEscalation()` and once in `updateEscalationStatus()`. If the error format changes (e.g., adding a `code` field to each issue), it would need updating in both places.
>
> ```typescript
> // Appears in createEscalation():
> details: parseResult.error.issues.map((issue) => ({
>   field: issue.path.join("."),
>   issue: issue.message,
> }))
>
> // Identical pattern in updateEscalationStatus()
> ```
>
> **Suggestion:** Extract to a shared helper function.

### 👨‍💻 Developer Response

Agreed — this is a straightforward DRY refactor. We'll extract it to `src/utils/validators.ts`.

### ✅ Resolution Action

Extracted to a shared utility:

```typescript
// src/utils/validators.ts

import { ZodError } from "zod";

/**
 * Converts a Zod parse error into the standard API error details format.
 *
 * @param zodError - The error from a failed safeParse() call
 * @returns Array of { field, issue } objects for inclusion in AppError details
 */
export function formatZodErrors(zodError: ZodError): Array<{ field: string; issue: string }> {
  return zodError.issues.map((issue) => ({
    field: issue.path.join("."),
    issue: issue.message,
  }));
}
```

Both controller methods updated:

```typescript
// Before (duplicated):
details: parseResult.error.issues.map((issue) => ({
  field: issue.path.join("."),
  issue: issue.message,
}))

// After (single source of truth):
details: formatZodErrors(parseResult.error)
```

### 📝 Justification

Single source of truth for error formatting. Any future changes to the error shape (e.g. adding a severity field) now require editing one function. Also simplifies controller unit testing since error formatting logic is independently testable.

---

## Review Comment 4 — Missing Tests

**File:** `src/services/escalation.service.ts`
**Function:** `updateStatus()`

### 🤖 CodeRabbit Comment

> **🔴 Testing: No unit tests for `updateStatus()` state machine**
>
> The `VALID_TRANSITIONS` map is a critical piece of business logic — it enforces which status transitions are permitted. However, there are no unit tests for `EscalationService.updateStatus()`.
>
> The following scenarios are currently untested:
> - Valid transition (e.g., OPEN → IN_PROGRESS)
> - Invalid transition (e.g., CLOSED → OPEN)
> - Escalation not found (404 path)
> - `resolvedAt` is set when transitioning to RESOLVED

### 👨‍💻 Developer Response

This was an oversight — the state machine is indeed the most important logic to test. We focused on the validation tests and missed the service-layer tests for updateStatus.

### ✅ Resolution Action

Added `tests/unit/escalation.service.test.ts` covering all identified scenarios:

```typescript
describe("EscalationService.updateStatus()", () => {
  it("should allow valid transition OPEN → IN_PROGRESS", async () => { ... });
  it("should allow valid transition IN_PROGRESS → RESOLVED with note", async () => { ... });
  it("should throw 400 for invalid transition CLOSED → OPEN", async () => { ... });
  it("should throw 404 when escalation does not exist", async () => { ... });
  it("should set resolvedAt when transitioning to RESOLVED", async () => { ... });
  it("should set resolvedAt when transitioning to CLOSED", async () => { ... });
  it("should NOT set resolvedAt for IN_PROGRESS transition", async () => { ... });
});
```

Coverage for `escalation.service.ts` increased from 61% → 88%.

### 📝 Justification

The state machine is the core business rule of this feature. A regression in `VALID_TRANSITIONS` (e.g., accidentally allowing CLOSED → OPEN) would be a silent data integrity bug. Tests are the only reliable guard.

---

## Review Comment 5 — Performance Concern

**File:** `src/services/escalation.service.ts`
**Function:** `getHistory()`
**Line:** 105

### 🤖 CodeRabbit Comment

> **🟡 Performance: N+1 query risk in team scope check**
>
> `getHistory()` calls `prisma.escalation.findUnique()` with `include: { task: true }` to get `task.teamId` for the scope check, and then calls `prisma.escalationAuditLog.findMany()` as a separate transaction. This is two queries to fetch a history page.
>
> For high-frequency calls (e.g., a manager refreshing the dashboard every 30 seconds), this doubles DB round trips unnecessarily.
>
> **Suggestion:** Include `task.teamId` in the audit log query directly, or cache the escalation's `teamId` on the `escalations` table itself to avoid the join.

### 👨‍💻 Developer Response

Valid concern for high-traffic scenarios. For the current scale (< 500 active escalations), 2 queries is acceptable. We'll make the pragmatic fix now (denormalise `teamId` onto escalations) and document the reasoning.

### ✅ Resolution Action

Added `teamId` as a denormalised column on the `escalations` table in the Prisma schema:

```prisma
// schema.prisma
model Escalation {
  id              String   @id @default(uuid())
  taskId          String
  teamId          String   // Denormalised from task for query performance
  status          EscalationStatus
  // ...
}
```

`getHistory()` updated to use `escalation.teamId` directly, eliminating the task join:

```typescript
// Before: fetches escalation WITH task join
const escalation = await this.prisma.escalation.findUnique({
  where: { id: escalationId },
  include: { task: true },               // ← join not needed anymore
});
if (escalation.task.teamId !== ...) ...  // ← removed

// After: single field lookup, no join
const escalation = await this.prisma.escalation.findUnique({
  where: { id: escalationId },
  select: { teamId: true },              // ← single column, no join
});
if (escalation.teamId !== ...) ...
```

History query now uses a single `$transaction` without preceding join.

### 📝 Justification

Denormalising `teamId` onto escalations is a standard optimisation for read-heavy permission checks. The trade-off is a slightly more complex `createEscalation()` that must populate `teamId` from the task — a one-time write cost. The read path (which runs far more frequently) is now 50% fewer DB queries. Migration is backward-compatible.

---

## Summary of Review Resolutions

| Comment | Type | Severity | Status |
|---|---|---|---|
| Structured logging / PII in error logs | Security | 🔴 High | ✅ Resolved — Winston logger added |
| Missing task status validation | Edge Case | 🟡 Medium | ✅ Resolved — 422 guard added + test |
| Duplicated Zod error formatter | Duplicate Code | 🟡 Medium | ✅ Resolved — `formatZodErrors()` extracted |
| Missing `updateStatus()` unit tests | Missing Tests | 🔴 High | ✅ Resolved — 7 tests added, coverage 61% → 88% |
| N+1 query in `getHistory()` | Performance | 🟡 Medium | ✅ Resolved — `teamId` denormalised onto escalations |
