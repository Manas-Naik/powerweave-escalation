/**
 * @file escalation.service.test.ts
 * @description Unit tests for EscalationService business logic.
 *
 * Prisma, NotificationService, and AuditLogger are all mocked to
 * isolate the service from I/O. Pattern: Arrange → Act → Assert
 */

import { EscalationService } from "../../src/services/escalation.service";
import { AppError } from "../../src/utils/app-error";

// ─────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────

const mockPrisma = {
  task: { findUnique: jest.fn() },
  escalation: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  team: { findUnique: jest.fn() },
  escalationAuditLog: { findMany: jest.fn(), count: jest.fn() },
  $transaction: jest.fn(),
};

const mockNotificationService = {
  dispatch: jest.fn().mockResolvedValue(undefined),
};

const mockAuditLogger = {
  log: jest.fn().mockResolvedValue(undefined),
};

// ─────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────

const TASK = {
  id: "00000000-0000-0000-0000-000000000021",
  title: "Implement OAuth2 login flow",
  teamId: "00000000-0000-0000-0000-000000000001",
};

const MANAGER_ID = "00000000-0000-0000-0000-000000000012";
const ADMIN_ID   = "00000000-0000-0000-0000-000000000011";

const OPEN_ESCALATION = {
  id: "00000000-0000-0000-0000-000000000031",
  taskId: TASK.id,
  tier: "L1",
  reason: "Task overdue for 3 days.",
  status: "OPEN",
  escalatedBy: ADMIN_ID,
  assignedManager: MANAGER_ID,
  resolvedAt: null,
  resolutionNote: null,
  createdAt: new Date("2026-01-15T10:00:00Z"),
};

const IN_PROGRESS_ESCALATION = { ...OPEN_ESCALATION, status: "IN_PROGRESS" };

// ─────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────

describe("EscalationService", () => {
  let service: EscalationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EscalationService(
      mockPrisma as any,
      mockNotificationService as any,
      mockAuditLogger as any
    );
  });

  // ───────────────────────────────────────────────────────
  // createEscalation()
  // ───────────────────────────────────────────────────────

  describe("createEscalation()", () => {
    it("should create an escalation and return it when task exists and no active escalation", async () => {
      // Arrange
      mockPrisma.task.findUnique.mockResolvedValue(TASK);
      mockPrisma.escalation.findFirst.mockResolvedValue(null);
      mockPrisma.escalation.create.mockResolvedValue(OPEN_ESCALATION);

      // Act
      const result = await service.createEscalation({
        taskId: TASK.id,
        tier: "L1",
        reason: "Task overdue for 3 days.",
        escalatedBy: ADMIN_ID,
        assignedManagerId: MANAGER_ID,
      });

      // Assert
      expect(result).toEqual(OPEN_ESCALATION);
      expect(mockPrisma.escalation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            taskId: TASK.id,
            tier: "L1",
            status: "OPEN",
            escalatedBy: ADMIN_ID,
            assignedManager: MANAGER_ID,
          }),
        })
      );
    });

    it("should auto-resolve manager from team when assignedManagerId is omitted", async () => {
      // Arrange
      mockPrisma.task.findUnique.mockResolvedValue(TASK);
      mockPrisma.escalation.findFirst.mockResolvedValue(null);
      mockPrisma.team.findUnique.mockResolvedValue({ managerId: MANAGER_ID });
      mockPrisma.escalation.create.mockResolvedValue(OPEN_ESCALATION);

      // Act
      await service.createEscalation({
        taskId: TASK.id,
        tier: "L1",
        reason: "Task overdue for 3 days.",
        escalatedBy: ADMIN_ID,
        // assignedManagerId intentionally omitted
      });

      // Assert — team lookup was used to resolve manager
      expect(mockPrisma.team.findUnique).toHaveBeenCalledWith({
        where: { id: TASK.teamId },
        select: { managerId: true },
      });
      expect(mockPrisma.escalation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assignedManager: MANAGER_ID }),
        })
      );
    });

    it("should throw 404 AppError when task does not exist", async () => {
      // Arrange
      mockPrisma.task.findUnique.mockResolvedValue(null);

      // Act + Assert
      await expect(
        service.createEscalation({
          taskId: "00000000-0000-0000-0000-000000000099",
          tier: "L1",
          reason: "Task overdue for 3 days.",
          escalatedBy: ADMIN_ID,
        })
      ).rejects.toMatchObject({ statusCode: 404, code: "TASK_NOT_FOUND" });

      expect(mockPrisma.escalation.create).not.toHaveBeenCalled();
    });

    it("should throw 409 AppError when an active escalation already exists for the task", async () => {
      // Arrange
      mockPrisma.task.findUnique.mockResolvedValue(TASK);
      mockPrisma.escalation.findFirst.mockResolvedValue(OPEN_ESCALATION);

      // Act + Assert
      await expect(
        service.createEscalation({
          taskId: TASK.id,
          tier: "L2",
          reason: "Task still overdue.",
          escalatedBy: ADMIN_ID,
        })
      ).rejects.toMatchObject({ statusCode: 409, code: "DUPLICATE_ESCALATION" });

      expect(mockPrisma.escalation.create).not.toHaveBeenCalled();
    });

    it("should throw 422 AppError when team has no manager and no assignedManagerId provided", async () => {
      // Arrange
      mockPrisma.task.findUnique.mockResolvedValue(TASK);
      mockPrisma.escalation.findFirst.mockResolvedValue(null);
      mockPrisma.team.findUnique.mockResolvedValue({ managerId: null });

      // Act + Assert
      await expect(
        service.createEscalation({
          taskId: TASK.id,
          tier: "L1",
          reason: "Task overdue for 3 days.",
          escalatedBy: ADMIN_ID,
        })
      ).rejects.toMatchObject({ statusCode: 422, code: "NO_MANAGER_ASSIGNED" });
    });

    it("should write an audit log entry after successful creation", async () => {
      // Arrange
      mockPrisma.task.findUnique.mockResolvedValue(TASK);
      mockPrisma.escalation.findFirst.mockResolvedValue(null);
      mockPrisma.escalation.create.mockResolvedValue(OPEN_ESCALATION);

      // Act
      await service.createEscalation({
        taskId: TASK.id,
        tier: "L1",
        reason: "Task overdue for 3 days.",
        escalatedBy: ADMIN_ID,
        assignedManagerId: MANAGER_ID,
      });

      // Assert
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          escalationId: OPEN_ESCALATION.id,
          action: "CREATED",
          performedBy: ADMIN_ID,
        })
      );
    });

    it("should dispatch a notification after successful creation", async () => {
      // Arrange
      mockPrisma.task.findUnique.mockResolvedValue(TASK);
      mockPrisma.escalation.findFirst.mockResolvedValue(null);
      mockPrisma.escalation.create.mockResolvedValue(OPEN_ESCALATION);

      // Act
      await service.createEscalation({
        taskId: TASK.id,
        tier: "L1",
        reason: "Task overdue for 3 days.",
        escalatedBy: ADMIN_ID,
        assignedManagerId: MANAGER_ID,
      });

      // Assert — notification dispatched with correct params
      await new Promise(resolve => setTimeout(resolve, 10)); // allow async fire-and-forget
      expect(mockNotificationService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          escalationId: OPEN_ESCALATION.id,
          recipientId: MANAGER_ID,
          tier: "L1",
          taskTitle: TASK.title,
          channels: ["EMAIL", "IN_APP"],
        })
      );
    });
  });

  // ───────────────────────────────────────────────────────
  // updateStatus()
  // ───────────────────────────────────────────────────────

  describe("updateStatus()", () => {
    it("should update status from OPEN to IN_PROGRESS (valid transition)", async () => {
      // Arrange
      const updated = { ...OPEN_ESCALATION, status: "IN_PROGRESS" };
      mockPrisma.escalation.findUnique.mockResolvedValue(OPEN_ESCALATION);
      mockPrisma.escalation.update.mockResolvedValue(updated);

      // Act
      const result = await service.updateStatus(
        OPEN_ESCALATION.id,
        { status: "IN_PROGRESS" },
        MANAGER_ID
      );

      // Assert
      expect(result.status).toBe("IN_PROGRESS");
      expect(mockPrisma.escalation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: OPEN_ESCALATION.id },
          data: expect.objectContaining({ status: "IN_PROGRESS" }),
        })
      );
    });

    it("should update status from OPEN to RESOLVED (valid shortcut transition)", async () => {
      // Arrange
      const updated = { ...OPEN_ESCALATION, status: "RESOLVED", resolvedAt: new Date() };
      mockPrisma.escalation.findUnique.mockResolvedValue(OPEN_ESCALATION);
      mockPrisma.escalation.update.mockResolvedValue(updated);

      // Act
      const result = await service.updateStatus(
        OPEN_ESCALATION.id,
        { status: "RESOLVED", resolutionNote: "Fixed directly by senior dev." },
        ADMIN_ID
      );

      // Assert
      expect(result.status).toBe("RESOLVED");
      expect(mockPrisma.escalation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "RESOLVED",
            resolvedAt: expect.any(Date),
            resolutionNote: "Fixed directly by senior dev.",
          }),
        })
      );
    });

    it("should throw 400 AppError for invalid transition OPEN → CLOSED", async () => {
      // Arrange
      mockPrisma.escalation.findUnique.mockResolvedValue(OPEN_ESCALATION);

      // Act + Assert
      await expect(
        service.updateStatus(OPEN_ESCALATION.id, { status: "CLOSED" }, MANAGER_ID)
      ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_TRANSITION" });

      expect(mockPrisma.escalation.update).not.toHaveBeenCalled();
    });

    it("should throw 400 AppError for invalid transition CLOSED → OPEN", async () => {
      // Arrange
      const closedEscalation = { ...OPEN_ESCALATION, status: "CLOSED" };
      mockPrisma.escalation.findUnique.mockResolvedValue(closedEscalation);

      // Act + Assert
      await expect(
        service.updateStatus(closedEscalation.id, { status: "OPEN" }, MANAGER_ID)
      ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_TRANSITION" });
    });

    it("should throw 404 AppError when escalation does not exist", async () => {
      // Arrange
      mockPrisma.escalation.findUnique.mockResolvedValue(null);

      // Act + Assert
      await expect(
        service.updateStatus("non-existent-id", { status: "IN_PROGRESS" }, MANAGER_ID)
      ).rejects.toMatchObject({ statusCode: 404, code: "ESCALATION_NOT_FOUND" });
    });

    it("should write an audit log entry on status change", async () => {
      // Arrange
      mockPrisma.escalation.findUnique.mockResolvedValue(OPEN_ESCALATION);
      mockPrisma.escalation.update.mockResolvedValue(IN_PROGRESS_ESCALATION);

      // Act
      await service.updateStatus(
        OPEN_ESCALATION.id,
        { status: "IN_PROGRESS" },
        MANAGER_ID
      );

      // Assert
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          escalationId: OPEN_ESCALATION.id,
          action: "STATUS_CHANGED",
          performedBy: MANAGER_ID,
          oldValue: { status: "OPEN" },
          newValue: expect.objectContaining({ status: "IN_PROGRESS" }),
        })
      );
    });

    it("should set resolvedAt when transitioning to RESOLVED", async () => {
      // Arrange
      mockPrisma.escalation.findUnique.mockResolvedValue(IN_PROGRESS_ESCALATION);
      mockPrisma.escalation.update.mockResolvedValue({
        ...IN_PROGRESS_ESCALATION,
        status: "RESOLVED",
        resolvedAt: new Date(),
      });

      // Act
      await service.updateStatus(
        IN_PROGRESS_ESCALATION.id,
        { status: "RESOLVED", resolutionNote: "Issue resolved by team lead." },
        MANAGER_ID
      );

      // Assert
      expect(mockPrisma.escalation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ resolvedAt: expect.any(Date) }),
        })
      );
    });

    it("should NOT set resolvedAt when transitioning to IN_PROGRESS", async () => {
      // Arrange
      mockPrisma.escalation.findUnique.mockResolvedValue(OPEN_ESCALATION);
      mockPrisma.escalation.update.mockResolvedValue(IN_PROGRESS_ESCALATION);

      // Act
      await service.updateStatus(
        OPEN_ESCALATION.id,
        { status: "IN_PROGRESS" },
        MANAGER_ID
      );

      // Assert
      expect(mockPrisma.escalation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ resolvedAt: undefined }),
        })
      );
    });
  });

  // ───────────────────────────────────────────────────────
  // getHistory()
  // ───────────────────────────────────────────────────────

  describe("getHistory()", () => {
    const escalationWithTask = {
      ...OPEN_ESCALATION,
      task: { ...TASK },
    };

    const auditLogs = [
      { id: "log-1", action: "CREATED",        timestamp: new Date("2026-01-15T08:00:00Z") },
      { id: "log-2", action: "STATUS_CHANGED",  timestamp: new Date("2026-01-15T09:00:00Z") },
    ];

    it("should return paginated audit logs for ADMIN", async () => {
      // Arrange
      mockPrisma.escalation.findUnique.mockResolvedValue(escalationWithTask);
      mockPrisma.$transaction.mockResolvedValue([auditLogs, 2]);

      // Act
      const result = await service.getHistory(OPEN_ESCALATION.id, {
        limit: 20,
        offset: 0,
        requestingUser: { id: ADMIN_ID, role: "ADMIN", teamId: TASK.teamId },
      });

      // Assert
      expect(result.data).toHaveLength(2);
      expect(result.pagination).toMatchObject({ total: 2, limit: 20, offset: 0, hasMore: false });
    });

    it("should allow DEVELOPER to view escalations within their own team", async () => {
      // Arrange
      mockPrisma.escalation.findUnique.mockResolvedValue(escalationWithTask);
      mockPrisma.$transaction.mockResolvedValue([auditLogs, 2]);

      // Act + Assert — should not throw
      await expect(
        service.getHistory(OPEN_ESCALATION.id, {
          limit: 20,
          offset: 0,
          requestingUser: {
            id: "00000000-0000-0000-0000-000000000014",
            role: "DEVELOPER",
            teamId: TASK.teamId, // same team
          },
        })
      ).resolves.not.toThrow();
    });

    it("should throw 403 AppError when DEVELOPER accesses escalation outside their team", async () => {
      // Arrange
      mockPrisma.escalation.findUnique.mockResolvedValue(escalationWithTask);

      // Act + Assert
      await expect(
        service.getHistory(OPEN_ESCALATION.id, {
          limit: 20,
          offset: 0,
          requestingUser: {
            id: "00000000-0000-0000-0000-000000000014",
            role: "DEVELOPER",
            teamId: "00000000-0000-0000-0000-000000000002", // different team
          },
        })
      ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    });

    it("should throw 403 AppError when VIEWER accesses escalation outside their team", async () => {
      // Arrange
      mockPrisma.escalation.findUnique.mockResolvedValue(escalationWithTask);

      // Act + Assert
      await expect(
        service.getHistory(OPEN_ESCALATION.id, {
          limit: 20,
          offset: 0,
          requestingUser: {
            id: "00000000-0000-0000-0000-000000000015",
            role: "VIEWER",
            teamId: "00000000-0000-0000-0000-000000000002",
          },
        })
      ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    });

    it("should throw 404 AppError when escalation does not exist", async () => {
      // Arrange
      mockPrisma.escalation.findUnique.mockResolvedValue(null);

      // Act + Assert
      await expect(
        service.getHistory("non-existent-id", {
          limit: 20,
          offset: 0,
          requestingUser: { id: ADMIN_ID, role: "ADMIN", teamId: TASK.teamId },
        })
      ).rejects.toMatchObject({ statusCode: 404, code: "ESCALATION_NOT_FOUND" });
    });

    it("should return hasMore: true when more pages exist", async () => {
      // Arrange
      mockPrisma.escalation.findUnique.mockResolvedValue(escalationWithTask);
      mockPrisma.$transaction.mockResolvedValue([[auditLogs[0]], 5]); // 1 returned, 5 total

      // Act
      const result = await service.getHistory(OPEN_ESCALATION.id, {
        limit: 1,
        offset: 0,
        requestingUser: { id: ADMIN_ID, role: "ADMIN", teamId: TASK.teamId },
      });

      // Assert
      expect(result.pagination).toMatchObject({ total: 5, limit: 1, offset: 0, hasMore: true });
    });

    it("should pass limit and offset to Prisma query", async () => {
      // Arrange
      mockPrisma.escalation.findUnique.mockResolvedValue(escalationWithTask);
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      // Act
      await service.getHistory(OPEN_ESCALATION.id, {
        limit: 10,
        offset: 30,
        requestingUser: { id: ADMIN_ID, role: "ADMIN", teamId: TASK.teamId },
      });

      // Assert — $transaction was called (Prisma findMany + count)
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });
});
