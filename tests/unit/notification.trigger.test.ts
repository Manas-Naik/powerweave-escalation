/**
 * @file notification.trigger.test.ts
 * @description Unit tests for NotificationService.dispatch().
 *
 * AWS SES client and Prisma are mocked to keep tests fast and deterministic.
 * Pattern: Arrange → Act → Assert
 */

import { NotificationService } from "../../src/services/notification.service";
import { AuditLogger } from "../../src/utils/audit.logger";

// ─────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────

// Mock AWS SES to avoid real network calls
jest.mock("@aws-sdk/client-ses", () => ({
  SESClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ MessageId: "ses-mock-id" }),
  })),
  SendEmailCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

// Mock Prisma
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  notification: {
    create: jest.fn(),
  },
};

// Mock AuditLogger
const mockAuditLogger: Partial<AuditLogger> = {
  log: jest.fn().mockResolvedValue(undefined),
};

// ─────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────

describe("NotificationService.dispatch()", () => {
  let service: NotificationService;

  // Fixed timestamp — ensures deterministic behaviour
  const FIXED_DATE = new Date("2025-01-15T10:00:00.000Z");

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(global, "Date").mockImplementation(() => FIXED_DATE as unknown as Date);

    service = new NotificationService(
      mockPrisma as any,
      mockAuditLogger as AuditLogger,
      "test@powerweave.io"
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("EMAIL channel", () => {
    it("should send an email and record a SENT notification for a valid user", async () => {
      // Arrange
      mockPrisma.user.findUnique.mockResolvedValue({
        email: "manager@powerweave.io",
        name: "Jane Manager",
      });
      mockPrisma.notification.create.mockResolvedValue({ id: "notif-id" });

      const input = {
        escalationId: "esc-uuid-001",
        recipientId: "user-uuid-001",
        tier: "L2" as const,
        taskTitle: "Implement login page",
        channels: ["EMAIL" as const],
      };

      // Act
      await service.dispatch(input);

      // Assert
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            escalationId: "esc-uuid-001",
            channel: "EMAIL",
            status: "SENT",
          }),
        })
      );
    });

    it("should record a FAILED notification when SES throws", async () => {
      // Arrange
      mockPrisma.user.findUnique.mockResolvedValue({
        email: "manager@powerweave.io",
        name: "Jane Manager",
      });
      mockPrisma.notification.create.mockResolvedValue({ id: "notif-id" });

      // Force SES to throw
      const { SESClient } = require("@aws-sdk/client-ses");
      SESClient.mockImplementationOnce(() => ({
        send: jest.fn().mockRejectedValue(new Error("SES connection refused")),
      }));

      service = new NotificationService(
        mockPrisma as any,
        mockAuditLogger as AuditLogger,
        "test@powerweave.io"
      );

      const input = {
        escalationId: "esc-uuid-002",
        recipientId: "user-uuid-001",
        tier: "L1" as const,
        taskTitle: "Fix API bug",
        channels: ["EMAIL" as const],
      };

      // Act
      await service.dispatch(input);

      // Assert — notification recorded as FAILED despite SES error
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "FAILED" }),
        })
      );
    });
  });

  describe("IN_APP channel", () => {
    it("should create an in-app notification record with the correct message", async () => {
      // Arrange
      mockPrisma.user.findUnique.mockResolvedValue({
        email: "manager@powerweave.io",
        name: "Jane Manager",
      });
      mockPrisma.notification.create.mockResolvedValue({ id: "notif-id" });

      const input = {
        escalationId: "esc-uuid-003",
        recipientId: "user-uuid-001",
        tier: "L3" as const,
        taskTitle: "Deploy hotfix",
        channels: ["IN_APP" as const],
      };

      // Act
      await service.dispatch(input);

      // Assert
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            channel: "IN_APP",
            status: "SENT",
            message: expect.stringContaining("Deploy hotfix"),
          }),
        })
      );
    });
  });

  describe("recipientOverrides", () => {
    it("should notify override recipients instead of default recipientId", async () => {
      // Arrange
      const overrideUserId = "override-user-uuid";
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ email: "override@powerweave.io", name: "Override User" });
      mockPrisma.notification.create.mockResolvedValue({ id: "notif-id" });

      const input = {
        escalationId: "esc-uuid-004",
        recipientId: "default-user-uuid", // should be ignored
        tier: "L1" as const,
        taskTitle: "Test task",
        channels: ["EMAIL" as const],
        recipientOverrides: [overrideUserId],
      };

      // Act
      await service.dispatch(input);

      // Assert — user lookup used override ID
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: overrideUserId } })
      );
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "default-user-uuid" } })
      );
    });
  });

  describe("missing user", () => {
    it("should skip notification gracefully when user is not found", async () => {
      // Arrange
      mockPrisma.user.findUnique.mockResolvedValue(null); // user not found

      const input = {
        escalationId: "esc-uuid-005",
        recipientId: "ghost-user-uuid",
        tier: "L2" as const,
        taskTitle: "Ghost task",
        channels: ["EMAIL" as const],
      };

      // Act — should not throw
      await expect(service.dispatch(input)).resolves.not.toThrow();

      // Assert — no notification record created
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe("audit logging", () => {
    it("should log a NOTIFIED audit entry after dispatch", async () => {
      // Arrange
      mockPrisma.user.findUnique.mockResolvedValue({
        email: "manager@powerweave.io",
        name: "Jane",
      });
      mockPrisma.notification.create.mockResolvedValue({ id: "notif-id" });

      const input = {
        escalationId: "esc-uuid-006",
        recipientId: "user-uuid-001",
        tier: "L1" as const,
        taskTitle: "Audit test task",
        channels: ["IN_APP" as const],
      };

      // Act
      await service.dispatch(input);

      // Assert
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          escalationId: "esc-uuid-006",
          action: "NOTIFIED",
          performedBy: "SYSTEM",
        })
      );
    });
  });
});
