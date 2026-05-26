/**
 * @file audit.logger.test.ts
 * @description Unit tests for AuditLogger.log() and getLogsForEscalation().
 *
 * Prisma is mocked to isolate the logger from the database.
 * Pattern: Arrange → Act → Assert
 */

import { AuditLogger, AuditLogInput } from "../../src/utils/audit.logger";

// ─────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────

const mockPrisma = {
  escalationAuditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

// ─────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────

describe("AuditLogger", () => {
  let logger: AuditLogger;
  const FIXED_DATE = new Date("2025-01-15T10:00:00.000Z");

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(global, "Date").mockImplementation(() => FIXED_DATE as unknown as Date);
    logger = new AuditLogger(mockPrisma as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────
  // log()
  // ─────────────────────────────────────────────────────

  describe("log()", () => {
    it("should persist an audit entry with correct fields for CREATED action", async () => {
      // Arrange
      mockPrisma.escalationAuditLog.create.mockResolvedValue({ id: "log-id-001" });

      const input: AuditLogInput = {
        escalationId: "esc-uuid-001",
        action: "CREATED",
        performedBy: "user-uuid-admin",
        newValue: { status: "OPEN", tier: "L1" },
      };

      // Act
      await logger.log(input);

      // Assert
      expect(mockPrisma.escalationAuditLog.create).toHaveBeenCalledWith({
        data: {
          escalationId: "esc-uuid-001",
          action: "CREATED",
          performedBy: "user-uuid-admin",
          oldValue: null,
          newValue: { status: "OPEN", tier: "L1" },
          timestamp: FIXED_DATE,
        },
      });
    });

    it("should persist a STATUS_CHANGED entry with oldValue and newValue", async () => {
      // Arrange
      mockPrisma.escalationAuditLog.create.mockResolvedValue({ id: "log-id-002" });

      const input: AuditLogInput = {
        escalationId: "esc-uuid-002",
        action: "STATUS_CHANGED",
        performedBy: "user-uuid-manager",
        oldValue: { status: "OPEN" },
        newValue: { status: "IN_PROGRESS" },
      };

      // Act
      await logger.log(input);

      // Assert
      expect(mockPrisma.escalationAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "STATUS_CHANGED",
            oldValue: { status: "OPEN" },
            newValue: { status: "IN_PROGRESS" },
          }),
        })
      );
    });

    it("should use 'SYSTEM' as performedBy for automated cron actions", async () => {
      // Arrange
      mockPrisma.escalationAuditLog.create.mockResolvedValue({ id: "log-id-003" });

      const input: AuditLogInput = {
        escalationId: "esc-uuid-003",
        action: "CREATED",
        performedBy: "SYSTEM",
        newValue: { tier: "L2", source: "cron" },
      };

      // Act
      await logger.log(input);

      // Assert
      expect(mockPrisma.escalationAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ performedBy: "SYSTEM" }),
        })
      );
    });

    it("should NOT throw when Prisma create fails (non-fatal audit)", async () => {
      // Arrange — simulate DB failure
      mockPrisma.escalationAuditLog.create.mockRejectedValue(
        new Error("Database connection lost")
      );

      const input: AuditLogInput = {
        escalationId: "esc-uuid-004",
        action: "NOTIFIED",
        performedBy: "SYSTEM",
        newValue: { channels: ["EMAIL"] },
      };

      // Act + Assert — must not throw
      await expect(logger.log(input)).resolves.not.toThrow();
    });

    it("should default oldValue to null when not provided", async () => {
      // Arrange
      mockPrisma.escalationAuditLog.create.mockResolvedValue({ id: "log-id-005" });

      const input: AuditLogInput = {
        escalationId: "esc-uuid-005",
        action: "CREATED",
        performedBy: "user-uuid-001",
        newValue: { status: "OPEN" },
        // oldValue intentionally omitted
      };

      // Act
      await logger.log(input);

      // Assert
      expect(mockPrisma.escalationAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ oldValue: null }),
        })
      );
    });
  });

  // ─────────────────────────────────────────────────────
  // getLogsForEscalation()
  // ─────────────────────────────────────────────────────

  describe("getLogsForEscalation()", () => {
    it("should return logs ordered by timestamp ascending", async () => {
      // Arrange
      const mockLogs = [
        { id: "log-1", action: "CREATED", timestamp: new Date("2025-01-15T08:00:00Z") },
        { id: "log-2", action: "STATUS_CHANGED", timestamp: new Date("2025-01-15T09:00:00Z") },
        { id: "log-3", action: "RESOLVED", timestamp: new Date("2025-01-15T10:00:00Z") },
      ];
      mockPrisma.escalationAuditLog.findMany.mockResolvedValue(mockLogs);

      // Act
      const result = await logger.getLogsForEscalation("esc-uuid-001");

      // Assert
      expect(mockPrisma.escalationAuditLog.findMany).toHaveBeenCalledWith({
        where: { escalationId: "esc-uuid-001" },
        orderBy: { timestamp: "asc" },
      });
      expect(result).toHaveLength(3);
      expect(result[0].action).toBe("CREATED");
      expect(result[2].action).toBe("RESOLVED");
    });

    it("should return an empty array when no logs exist for the escalation", async () => {
      // Arrange
      mockPrisma.escalationAuditLog.findMany.mockResolvedValue([]);

      // Act
      const result = await logger.getLogsForEscalation("esc-no-logs");

      // Assert
      expect(result).toEqual([]);
    });
  });
});
