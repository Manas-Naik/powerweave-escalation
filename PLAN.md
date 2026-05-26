# PLAN.md — Smart Task Escalation Engine

**Project:** Powerweave — Smart Task Escalation Engine
**Phase:** SDLR Delivery (Phase 5–7)
**Owner:** Engineering Team
**Last Updated:** 2025-01-15

---

## Active MCP Servers

| MCP Server | Purpose | Benefit to AI Coding Agents |
|---|---|---|
| **GitHub MCP** | Repository management, PR creation, branch operations | Agents can commit code, open PRs, read file trees without leaving the IDE context |
| **PostgreSQL MCP** | Direct DB schema inspection, query execution, migration validation | Agents validate schema changes and run test queries against live dev DB |
| **AWS MCP** | ECS task management, SES email config, SNS topic setup, CloudWatch logs | Agents can provision infra, tail logs, and trigger test notifications |
| **Playwright MCP** | Browser automation, E2E test execution and result reporting | Agents run and interpret E2E tests end-to-end in CI loop |
| **Notion MCP** | Sync task specs, acceptance criteria, and design notes to planning docs | Agents pull updated requirements without manual copy-paste |

---

## Phase 5 — Architecture & Planning

### Task 1: Architecture Design Document
- [ ] Write system overview section
- [ ] Document modular monolith structure
- [ ] Define data flow diagrams
- [ ] Describe Frontend ↔ Backend interaction
- [ ] Document authentication approach (JWT + RBAC)
- [ ] Define database entities
- [ ] List external integrations (AWS SES, SNS)
- [ ] Justify Build vs Buy decisions

**Acceptance Criteria:**
- All 8 mandatory sections present in `docs/ARCHITECTURE.md`
- Reviewed and signed off by Tech Lead
- Data flow covers happy path and failure scenarios

---

### Task 2: Planning Files
- [x] Create `README.md` (≤800 words)
- [x] Create `PLAN.md` (≤2,000 words)
- [x] Create `STATUS.md` (≤400 words)

**Acceptance Criteria:**
- Word limits respected for each file
- All mandatory sub-sections present
- Files committed to `main` branch under root directory

---

### Task 3: MCP Server Selection
- [x] Identify relevant MCP servers for the stack
- [x] Document purpose and agent benefit for each
- [x] Include "Active MCP Servers" section in PLAN.md

**Acceptance Criteria:**
- Minimum 4 MCP servers documented
- Each entry includes: name, purpose, and AI agent benefit
- Servers map to actual stack components (Node, PostgreSQL, AWS, Playwright)

---

### Task 4: ARB Checklist
- [ ] Security section: Auth, input validation, secrets management
- [ ] Scalability section: Horizontal scaling, DB indexing, async processing
- [ ] API consistency: REST conventions, versioning, error format
- [ ] Documentation: README, inline docs, API schema present
- [ ] Build vs Buy rationale documented
- [ ] MCP coverage confirmed
- [ ] Planning file completeness verified

**Acceptance Criteria:**
- Checklist exported as `docs/ARB_CHECKLIST.md`
- All items rated: ✅ Pass / ⚠️ Risk / ❌ Fail with justification
- ARB sign-off recorded

---

### Task 5: API Schema Design
- [ ] `POST /api/v1/escalations` — Create escalation
- [ ] `GET /api/v1/escalations/{id}/history` — Fetch escalation history
- [ ] `PATCH /api/v1/escalations/{id}/status` — Update escalation status
- [ ] `POST /api/v1/notifications/trigger` — Trigger notification

**Acceptance Criteria:**
- All 4 endpoints defined in YAML format under `api-schema/escalation.yaml`
- Each endpoint documents: method, path, request body, response schema, error codes
- Schema validates with an OpenAPI linter (e.g. Spectral)

---

## Phase 6 — Agentic Code Generation

### Task 6: Development Session Ritual
- [ ] Document context loading steps
- [ ] Define planning file usage protocol
- [ ] MCP activation checklist
- [ ] Task identification from PLAN.md
- [ ] AI prompt strategy guide
- [ ] Create repeatable session checklist `docs/DEV_SESSION.md`

**Acceptance Criteria:**
- Session checklist covers pre-session, active coding, and wrap-up phases
- Checklist is runnable in ≤5 minutes by any developer
- MCP activation steps include verification commands

---

### Task 7: Prototype — Core Modules
- [ ] **Escalation Creation Module** (`src/controllers/escalation.controller.ts`)
  - [ ] `createEscalation()` handler
  - [ ] Zod request validation
  - [ ] Service layer call
- [ ] **Notification Service** (`src/services/notification.service.ts`)
  - [ ] Email notification via AWS SES
  - [ ] In-app notification record creation
  - [ ] Role-based recipient resolution
- [ ] **Audit Logger** (`src/utils/audit.logger.ts`)
  - [ ] Log escalation create/update/resolve events
  - [ ] Store in `escalation_audit_logs` table

**Acceptance Criteria:**
- All three modules compile with `tsc --noEmit`
- Each module has corresponding unit tests (≥80% coverage)
- AI prompts used are documented in `docs/AI_PROMPTS.md`

---

### Task 8: Agentic Development Loop
- [ ] Load context (README + PLAN + STATUS)
- [ ] Generate code via AI tool
- [ ] Run unit tests: `npm test`
- [ ] Fix failing tests
- [ ] Commit to feature branch
- [ ] Update PLAN.md checkboxes
- [ ] Update STATUS.md with timestamped entry

**Acceptance Criteria:**
- Loop executed ≥1 full cycle with documented output
- All test failures resolved before commit
- STATUS.md updated within same session

---

### Task 9: Unit Tests
- [ ] `tests/unit/escalation.validation.test.ts`
- [ ] `tests/unit/role.permission.test.ts`
- [ ] `tests/unit/notification.trigger.test.ts`
- [ ] `tests/unit/audit.logger.test.ts`

**Acceptance Criteria:**
- `npm test -- --coverage` reports ≥80% coverage across all modules
- All tests follow Arrange → Act → Assert pattern
- No tests use `Math.random()`, `Date.now()` without mocking (deterministic only)

---

### Task 10: Inline Documentation
- [ ] Document all exported functions with JSDoc
- [ ] Add inline comments for non-obvious logic
- [ ] Document API integration calls
- [ ] Document data transformation flows
- [ ] Add well-documented vs poorly-documented comparison to `docs/DOC_STANDARDS.md`

**Acceptance Criteria:**
- All public functions in `services/` and `controllers/` have JSDoc blocks
- ESLint `valid-jsdoc` rule passes with 0 errors
- Documentation comparison example present in `docs/DOC_STANDARDS.md`

---

## Phase 7 — Automated Code Review

### Task 11: Pull Request
- [ ] Create PR: `feature/smart-task-escalation-engine` → `main`
- [ ] PR title follows convention: `feat(escalation): add smart task escalation engine`
- [ ] Link user stories: US-101, US-102, US-103
- [ ] Write scope summary
- [ ] Add testing notes (unit + E2E)
- [ ] Document known limitations

**Acceptance Criteria:**
- PR scoped to single feature set (escalation engine only)
- All CI checks pass before review request
- PR description follows template in `.github/PULL_REQUEST_TEMPLATE.md`

---

### Task 12: CodeRabbit Review Simulation
- [ ] Simulate security issue comment + resolution
- [ ] Simulate missing edge case comment + resolution
- [ ] Simulate duplicate code comment + resolution
- [ ] Simulate missing tests comment + resolution
- [ ] Simulate performance concern comment + resolution

**Acceptance Criteria:**
- All 5 comment types present in `docs/CODE_REVIEW.md`
- Each includes: developer response, resolution action, justification
- Resolutions reflected as code changes (or documented trade-offs)
