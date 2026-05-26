# Development Session Ritual — SDLR Checklist
# Smart Task Escalation Engine — Powerweave

**Reference:** SDLR Phase 6 — Development Session Initialization
**Version:** 1.0

---

## Overview

Every development session follows this repeatable ritual to ensure AI coding agents operate with full context, the right tools activated, and a clear task boundary. This prevents context drift, duplicate work, and untracked changes.

---

## Phase A: Pre-Session Setup (≈5 minutes)

### A1. Context Loading

```bash
# 1. Pull latest changes
git pull origin main

# 2. Review planning files in order
cat README.md          # Capability overview, stack, setup
cat PLAN.md            # Find next unchecked task
cat STATUS.md          # Check blockers and in-progress items
```

**Checklist:**
- [ ] Pulled latest from `main` / feature branch
- [ ] Read README.md — refreshed on system purpose
- [ ] Read PLAN.md — identified 1 specific task to work on this session
- [ ] Read STATUS.md — aware of all active blockers

---

### A2. MCP Activation

Verify all required MCP servers are running before opening the AI coding tool.

```bash
# Verify GitHub MCP
gh auth status                          # Should show: Logged in as <user>

# Verify PostgreSQL MCP
psql $DATABASE_URL -c "SELECT 1;"       # Should return: 1 row

# Verify AWS MCP
aws sts get-caller-identity             # Should return account/role details

# Verify Playwright MCP (if running E2E this session)
npx playwright --version                # Should print version

# Verify Notion MCP (if syncing specs)
# Check connector status in IDE MCP panel
```

**Checklist:**
- [ ] GitHub MCP: authenticated and repo accessible
- [ ] PostgreSQL MCP: dev database reachable
- [ ] AWS MCP: credentials valid (ECS role or local profile)
- [ ] Playwright MCP: activated if E2E tests planned this session
- [ ] Notion MCP: activated if pulling updated requirements

---

### A3. Task Identification

From PLAN.md, pick **one** unchecked task. Do not start multiple tasks in one session.

```
Example selection from PLAN.md:
- [ ] Escalation Creation Module — src/controllers/escalation.controller.ts
       └── [ ] createEscalation() handler
       └── [ ] Zod request validation
       └── [ ] Service layer call
```

**Checklist:**
- [ ] One task identified from PLAN.md
- [ ] Acceptance criteria re-read for that task
- [ ] Feature branch created: `git checkout -b feature/<task-name>`

---

## Phase B: Active Coding Session

### B1. AI Prompt Strategy

Use structured prompts for best AI output. Follow this template:

```
ROLE:     You are a TypeScript backend developer working on [module name].
CONTEXT:  [paste relevant section of ARCHITECTURE.md or describe the component]
TASK:     [specific function/file to create]
RULES:    
  - Use Zod for validation
  - Follow Arrange→Act→Assert for tests
  - JSDoc all exported functions
  - No raw SQL — use Prisma only
  - Error handling must use the centralized ErrorHandler
OUTPUT:   [TypeScript source file / unit test file]
```

**Prompt Strategy Checklist:**
- [ ] Role established (backend dev, TypeScript)
- [ ] Context provided (architecture section or component description)
- [ ] Task scoped to single function or file (not entire module at once)
- [ ] Rules explicitly listed (prevents common AI mistakes)
- [ ] Output format specified (source file, test file, YAML, etc.)

---

### B2. Coding Loop

```
1. AI generates code  
2. Developer reviews output (logic, security, style)
3. Run linter: npm run lint
4. Run type check: npx tsc --noEmit
5. Run unit tests: npm test -- --testPathPattern=<module>
6. If tests fail → give failure output back to AI with prompt:
   "These tests failed: [paste output]. Fix the implementation."
7. Iterate until all tests pass
8. Manual review: check edge cases, null handling, error paths
```

**Coding Loop Checklist:**
- [ ] Generated code reviewed by developer (not blindly accepted)
- [ ] Linter passes: `npm run lint` — 0 errors
- [ ] TypeScript compiles: `npx tsc --noEmit` — 0 errors
- [ ] Unit tests pass: `npm test` — 0 failures
- [ ] Edge cases manually verified (null inputs, empty arrays, boundary values)

---

### B3. Test-First Enforcement

For every new function, write the test before or simultaneously with the implementation.

```bash
# Run coverage for the specific module
npm test -- --coverage --testPathPattern=escalation

# Coverage gate: must show ≥80% for the module
```

- [ ] Unit tests written for all new exported functions
- [ ] Coverage ≥80% for the module being worked on
- [ ] All tests are deterministic (no `Math.random()`, mock `Date.now()`)

---

## Phase C: Session Wrap-Up (≈10 minutes)

### C1. Commit Changes

```bash
# Stage and commit
git add src/ tests/
git commit -m "feat(escalation): implement createEscalation controller with validation"

# Push feature branch
git push origin feature/escalation-controller
```

**Commit message convention:**
`<type>(<scope>): <description>`
Types: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`

- [ ] All changed files staged and committed
- [ ] Commit message follows convention
- [ ] Feature branch pushed to remote

---

### C2. Update PLAN.md

Mark completed sub-tasks with `[x]` in PLAN.md.

```markdown
- [x] createEscalation() handler        ← mark done
- [x] Zod request validation            ← mark done
- [ ] Service layer call                ← still pending, left for next session
```

- [ ] Completed sub-tasks marked `[x]` in PLAN.md
- [ ] No tasks marked complete that haven't been tested

---

### C3. Update STATUS.md

Add a timestamped entry to STATUS.md.

```markdown
## ✅ Completed
| createEscalation() controller + Zod validation | 2025-01-15T15:45:00+05:30 |

## 🔄 In Progress
| Service layer call for escalation creation | Dev 1 |
```

- [ ] Completed work moved to "Completed" section in STATUS.md
- [ ] In-progress items updated
- [ ] Any new blockers discovered added to Blockers section
- [ ] Timestamp updated to current date/time

---

## Session Checklist — Quick Reference Card

```
PRE-SESSION
□ git pull
□ Read README → PLAN → STATUS
□ Verify MCP servers (GitHub, PG, AWS, Playwright if needed)
□ Pick ONE task from PLAN.md
□ Create feature branch

DURING SESSION
□ Structured AI prompt (Role + Context + Task + Rules + Output)
□ Review AI output before accepting
□ npm run lint → 0 errors
□ npx tsc --noEmit → 0 errors
□ npm test → 0 failures
□ Coverage ≥ 80% for touched modules

WRAP-UP
□ git commit + push
□ Mark tasks [x] in PLAN.md
□ Update STATUS.md with timestamp
□ Note any new blockers
```
