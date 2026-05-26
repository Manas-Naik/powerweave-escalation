/**
 * @file escalation.validation.test.ts
 * @description Unit tests for Zod validation schemas used in escalation controller.
 *
 * Tests: CreateEscalationSchema, UpdateStatusSchema
 * Pattern: Arrange → Act → Assert
 */

import { CreateEscalationSchema, UpdateStatusSchema } from "../../src/controllers/escalation.controller";

// ─────────────────────────────────────────────────────────
// CreateEscalationSchema
// ─────────────────────────────────────────────────────────

describe("CreateEscalationSchema", () => {
  describe("valid inputs", () => {
    it("should pass with all required fields provided correctly", () => {
      // Arrange
      const input = {
        taskId: "3f4a2c1d-89ab-4cde-b012-3456789abcde",
        tier: "L1",
        reason: "Task is 4 hours overdue with no update.",
      };

      // Act
      const result = CreateEscalationSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });

    it("should pass with optional assignedManagerId provided", () => {
      // Arrange
      const input = {
        taskId: "3f4a2c1d-89ab-4cde-b012-3456789abcde",
        tier: "L2",
        reason: "Task overdue for 8 hours; escalating to manager.",
        assignedManagerId: "9c0d1e2f-3456-789a-bcde-f01234567890",
      };

      // Act
      const result = CreateEscalationSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });

    it("should accept all three valid tier values", () => {
      // Arrange
      const tiers = ["L1", "L2", "L3"];

      // Act + Assert
      for (const tier of tiers) {
        const result = CreateEscalationSchema.safeParse({
          taskId: "3f4a2c1d-89ab-4cde-b012-3456789abcde",
          tier,
          reason: "Valid reason for escalation.",
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("invalid inputs — taskId", () => {
    it("should fail when taskId is not a valid UUID", () => {
      // Arrange
      const input = { taskId: "not-a-uuid", tier: "L1", reason: "Valid reason here." };

      // Act
      const result = CreateEscalationSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("taskId");
        expect(result.error.issues[0].message).toMatch(/uuid/i);
      }
    });

    it("should fail when taskId is missing", () => {
      // Arrange
      const input = { tier: "L1", reason: "Valid reason here." };

      // Act
      const result = CreateEscalationSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
    });
  });

  describe("invalid inputs — tier", () => {
    it("should fail with an invalid tier value", () => {
      // Arrange
      const input = {
        taskId: "3f4a2c1d-89ab-4cde-b012-3456789abcde",
        tier: "L4", // invalid
        reason: "Valid reason here.",
      };

      // Act
      const result = CreateEscalationSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("tier");
      }
    });

    it("should fail when tier is missing", () => {
      // Arrange
      const input = {
        taskId: "3f4a2c1d-89ab-4cde-b012-3456789abcde",
        reason: "Valid reason here.",
      };

      // Act
      const result = CreateEscalationSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
    });
  });

  describe("invalid inputs — reason", () => {
    it("should fail when reason is shorter than 10 characters", () => {
      // Arrange
      const input = {
        taskId: "3f4a2c1d-89ab-4cde-b012-3456789abcde",
        tier: "L1",
        reason: "Short",
      };

      // Act
      const result = CreateEscalationSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toMatch(/10 characters/i);
      }
    });

    it("should fail when reason exceeds 500 characters", () => {
      // Arrange
      const input = {
        taskId: "3f4a2c1d-89ab-4cde-b012-3456789abcde",
        tier: "L1",
        reason: "x".repeat(501),
      };

      // Act
      const result = CreateEscalationSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toMatch(/500 characters/i);
      }
    });

    it("should accept a reason of exactly 10 characters (boundary value)", () => {
      // Arrange
      const input = {
        taskId: "3f4a2c1d-89ab-4cde-b012-3456789abcde",
        tier: "L1",
        reason: "1234567890",
      };

      // Act
      const result = CreateEscalationSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });

    it("should accept a reason of exactly 500 characters (boundary value)", () => {
      // Arrange
      const input = {
        taskId: "3f4a2c1d-89ab-4cde-b012-3456789abcde",
        tier: "L1",
        reason: "x".repeat(500),
      };

      // Act
      const result = CreateEscalationSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────
// UpdateStatusSchema
// ─────────────────────────────────────────────────────────

describe("UpdateStatusSchema", () => {
  describe("valid inputs", () => {
    it("should pass for OPEN → IN_PROGRESS without resolutionNote", () => {
      // Arrange
      const input = { status: "IN_PROGRESS" };

      // Act
      const result = UpdateStatusSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });

    it("should pass for RESOLVED with a resolutionNote", () => {
      // Arrange
      const input = {
        status: "RESOLVED",
        resolutionNote: "Dev completed the task and QA verified it.",
      };

      // Act
      const result = UpdateStatusSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });

    it("should pass for CLOSED with a resolutionNote", () => {
      // Arrange
      const input = {
        status: "CLOSED",
        resolutionNote: "Escalation closed after stakeholder sign-off.",
      };

      // Act
      const result = UpdateStatusSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe("invalid inputs", () => {
    it("should fail for RESOLVED without a resolutionNote", () => {
      // Arrange
      const input = { status: "RESOLVED" };

      // Act
      const result = UpdateStatusSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toMatch(/resolutionNote is required/i);
      }
    });

    it("should fail for CLOSED without a resolutionNote", () => {
      // Arrange
      const input = { status: "CLOSED" };

      // Act
      const result = UpdateStatusSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
    });

    it("should fail for RESOLVED with an empty resolutionNote", () => {
      // Arrange
      const input = { status: "RESOLVED", resolutionNote: "   " };

      // Act
      const result = UpdateStatusSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
    });

    it("should fail with an invalid status value", () => {
      // Arrange
      const input = { status: "PENDING" }; // not in enum

      // Act
      const result = UpdateStatusSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
    });
  });
});
