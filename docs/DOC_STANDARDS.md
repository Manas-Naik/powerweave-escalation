# Documentation Standards — Smart Task Escalation Engine

**Reference:** SDLR Phase 6, Task 10 — Inline Documentation

---

## The Problem: Why Documentation Matters

Poorly documented code creates invisible knowledge silos. When the original author is unavailable, undocumented code forces new developers to reverse-engineer intent — wasting hours and introducing bugs from incorrect assumptions. For AI coding agents, documentation is even more critical: it is the primary signal used to understand what a function does, what it expects, and what can go wrong.

---

## Comparison: Poorly Documented vs Well Documented

### Example: Resolve team manager function

---

### ❌ Poorly Documented Version

```typescript
private async getTM(tid: string): Promise<string> {
  const t = await this.prisma.team.findUnique({
    where: { id: tid },
    select: { managerId: true }
  });
  if (!t?.managerId) {
    throw new AppError(422, "NMA", `No manager: ${tid}`);
  }
  return t.managerId;
}
```

**Problems with this code:**

1. **Abbreviation overload** — `getTM`, `tid`, `t` tell you nothing. Is `TM` "Team Manager"? "Task Manager"? "Technical Meeting"?
2. **No JSDoc** — The function signature reveals `string → string` but not *what* the strings represent.
3. **No parameter documentation** — A reader doesn't know `tid` is a team UUID without tracing callers.
4. **Opaque error code** — `"NMA"` is meaningless without context; a developer debugging a 422 error has no idea where to look.
5. **No description of side effects or failure modes** — What happens if the team itself doesn't exist? Is that the same error path?
6. **AI agent impact** — If an AI agent reads this function, it cannot infer: when to call it, what to pass, or how to handle failures. It may generate callers with incorrect assumptions.

---

### ✅ Well Documented Version

```typescript
/**
 * Resolves the default manager for a given team by looking up
 * the team record in the database.
 *
 * Falls back gracefully: if no team manager is assigned, throws a
 * 422 Unprocessable Entity error prompting the caller to supply an
 * explicit `assignedManagerId` in the escalation request.
 *
 * Used internally by `createEscalation()` when the caller does not
 * provide an `assignedManagerId` override.
 *
 * @param teamId - UUID of the team whose manager to resolve.
 *                 Must be a valid team ID from the `teams` table.
 * @returns The UUID of the team's assigned manager.
 * @throws AppError(422, "NO_MANAGER_ASSIGNED") if the team has no
 *         manager set. Does NOT throw if the team itself is not found
 *         (the caller's task lookup would have already caught that).
 *
 * @example
 * // Used inside createEscalation when no override is provided:
 * const managerId = await this.resolveTeamManager(task.teamId);
 */
private async resolveTeamManager(teamId: string): Promise<string> {
  const team = await this.prisma.team.findUnique({
    where: { id: teamId },
    select: { managerId: true },
  });

  if (!team?.managerId) {
    throw new AppError(
      422,
      "NO_MANAGER_ASSIGNED",
      `Team ${teamId} has no manager assigned. Provide assignedManagerId explicitly.`
    );
  }

  return team.managerId;
}
```

**What makes this good:**

| Element | Value it provides |
|---|---|
| Summary sentence | Immediately clear: "look up manager for a team" |
| "Falls back gracefully" note | Explains design intent, not just behaviour |
| "Used internally by" note | Gives context — where this fits in the call graph |
| `@param teamId` with description | No ambiguity about what string to pass |
| `@returns` description | Explicit about what the UUID represents |
| `@throws` with condition | Developers handling errors know *exactly* when this fires and what error code to catch |
| `@example` | AI agents and new developers can copy a correct usage pattern immediately |

---

## Documentation Rules for This Project

### Required: JSDoc on all exported functions

Every `export`-ed function in `src/` must have a JSDoc block with:
- One-line summary (what it does, not how)
- `@param` for each parameter with type and description
- `@returns` describing what the return value represents
- `@throws` listing every AppError that can be thrown with its condition

### Required: Inline comments for non-obvious logic

Any code that is not self-evident from naming must have an inline comment explaining *why*, not *what*.

```typescript
// ✅ GOOD — explains WHY
// Non-blocking: notification failure should not roll back the escalation.
// The escalation is persisted; we just log the notification failure for monitoring.
this.notificationService.dispatch(...).catch((err) => {
  console.error(`Notification failed: ${err.message}`);
});

// ❌ BAD — explains WHAT (already obvious from the code)
// Call dispatch on notification service and catch errors
this.notificationService.dispatch(...).catch((err) => {
  console.error(err.message);
});
```

### Required: Document data transformations

Any place where data changes shape (e.g. mapping Prisma entity to API response DTO, transforming audit log JSONB) must be documented:

```typescript
/**
 * Maps a raw Prisma escalation record to the public API response DTO.
 *
 * Excludes internal fields: `internalNotes`, `rawAuditBlob`.
 * Converts snake_case DB fields to camelCase for API consumers.
 *
 * @param record - Raw Prisma Escalation entity from the database
 * @returns EscalationResponseDto safe to serialise to JSON
 */
function toResponseDto(record: PrismaEscalation): EscalationResponseDto { ... }
```

### Prohibited: Documentation anti-patterns

```typescript
// ❌ Noise comment — says nothing
// increment i
i++;

// ❌ Redundant JSDoc
/**
 * Gets the user.
 * @param id the id
 * @returns the user
 */
async getUser(id: string) { ... }

// ❌ Outdated comment (worse than no comment)
// Returns user list sorted by name ← but code now sorts by date
return users.sort((a, b) => b.createdAt - a.createdAt);
```

---

## CI Enforcement

```json
// .eslintrc.json — enforces JSDoc on exported symbols
{
  "rules": {
    "valid-jsdoc": ["error", { "requireReturn": true }],
    "require-jsdoc": ["error", {
      "require": {
        "FunctionDeclaration": true,
        "MethodDefinition": true,
        "ClassDeclaration": true
      }
    }]
  }
}
```

ESLint `valid-jsdoc` runs in CI (`npm run lint`). A PR with missing JSDoc will fail the pipeline.
