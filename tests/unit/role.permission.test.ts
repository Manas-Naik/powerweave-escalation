/**
 * @file role.permission.test.ts
 * @description Unit tests for the RBAC permission map and requirePermission middleware.
 *
 * Tests: ROLE_PERMISSIONS map, requirePermission middleware factory
 * Pattern: Arrange → Act → Assert
 */

import { Request, Response, NextFunction } from "express";
import { requirePermission, ROLE_PERMISSIONS, UserRole } from "../../src/middleware/rbac.guard";
import { AppError } from "../../src/utils/app-error";

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

/**
 * Builds a minimal mock Express Request with an authenticated user.
 */
function buildRequest(role: UserRole): Partial<Request> {
  return {
    user: { id: "user-uuid-123", role, teamId: "team-uuid-456" } as any,
  };
}

const mockResponse = {} as Response;

// ─────────────────────────────────────────────────────────
// ROLE_PERMISSIONS map
// ─────────────────────────────────────────────────────────

describe("ROLE_PERMISSIONS map", () => {
  it("should allow ADMIN and MANAGER to create escalations", () => {
    // Arrange + Act + Assert
    expect(ROLE_PERMISSIONS["CAN_CREATE_ESCALATION"]).toContain("ADMIN");
    expect(ROLE_PERMISSIONS["CAN_CREATE_ESCALATION"]).toContain("MANAGER");
  });

  it("should NOT allow DEVELOPER or VIEWER to create escalations", () => {
    expect(ROLE_PERMISSIONS["CAN_CREATE_ESCALATION"]).not.toContain("DEVELOPER");
    expect(ROLE_PERMISSIONS["CAN_CREATE_ESCALATION"]).not.toContain("VIEWER");
  });

  it("should allow only ADMIN to trigger notifications", () => {
    // Arrange + Act
    const allowed = ROLE_PERMISSIONS["CAN_TRIGGER_NOTIFICATION"];

    // Assert
    expect(allowed).toEqual(["ADMIN"]);
  });

  it("should allow all roles to view escalations", () => {
    // Arrange
    const allRoles: UserRole[] = ["ADMIN", "MANAGER", "DEVELOPER", "VIEWER"];

    // Act
    const allowed = ROLE_PERMISSIONS["CAN_VIEW_ESCALATION"];

    // Assert
    allRoles.forEach((role) => expect(allowed).toContain(role));
  });

  it("should restrict CAN_VIEW_ALL_TEAMS to ADMIN only", () => {
    expect(ROLE_PERMISSIONS["CAN_VIEW_ALL_TEAMS"]).toEqual(["ADMIN"]);
  });
});

// ─────────────────────────────────────────────────────────
// requirePermission middleware
// ─────────────────────────────────────────────────────────

describe("requirePermission middleware", () => {
  describe("when user has permission", () => {
    it("should call next() without error for ADMIN on CAN_CREATE_ESCALATION", () => {
      // Arrange
      const req = buildRequest("ADMIN") as Request;
      const next = jest.fn() as NextFunction;

      // Act
      requirePermission("CAN_CREATE_ESCALATION")(req, mockResponse, next);

      // Assert
      expect(next).toHaveBeenCalledWith(); // called with no arguments = success
    });

    it("should call next() without error for MANAGER on CAN_UPDATE_ESCALATION_STATUS", () => {
      // Arrange
      const req = buildRequest("MANAGER") as Request;
      const next = jest.fn() as NextFunction;

      // Act
      requirePermission("CAN_UPDATE_ESCALATION_STATUS")(req, mockResponse, next);

      // Assert
      expect(next).toHaveBeenCalledWith();
    });

    it("should allow VIEWER to pass CAN_VIEW_ESCALATION check", () => {
      // Arrange
      const req = buildRequest("VIEWER") as Request;
      const next = jest.fn() as NextFunction;

      // Act
      requirePermission("CAN_VIEW_ESCALATION")(req, mockResponse, next);

      // Assert
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe("when user lacks permission", () => {
    it("should call next(AppError 403) for DEVELOPER on CAN_CREATE_ESCALATION", () => {
      // Arrange
      const req = buildRequest("DEVELOPER") as Request;
      const next = jest.fn() as NextFunction;

      // Act
      requirePermission("CAN_CREATE_ESCALATION")(req, mockResponse, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = (next as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe("FORBIDDEN");
    });

    it("should call next(AppError 403) for VIEWER on CAN_TRIGGER_NOTIFICATION", () => {
      // Arrange
      const req = buildRequest("VIEWER") as Request;
      const next = jest.fn() as NextFunction;

      // Act
      requirePermission("CAN_TRIGGER_NOTIFICATION")(req, mockResponse, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = (next as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(403);
    });

    it("should call next(AppError 403) for MANAGER on CAN_VIEW_ALL_TEAMS", () => {
      // Arrange
      const req = buildRequest("MANAGER") as Request;
      const next = jest.fn() as NextFunction;

      // Act
      requirePermission("CAN_VIEW_ALL_TEAMS")(req, mockResponse, next);

      // Assert
      const error = (next as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(403);
    });
  });

  describe("edge cases", () => {
    it("should return 401 when req.user is not populated", () => {
      // Arrange
      const req = { user: undefined } as unknown as Request;
      const next = jest.fn() as NextFunction;

      // Act
      requirePermission("CAN_CREATE_ESCALATION")(req, mockResponse, next);

      // Assert
      const error = (next as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe("UNAUTHORISED");
    });

    it("should return 500 for an unknown permission key (fail-closed)", () => {
      // Arrange
      const req = buildRequest("ADMIN") as Request;
      const next = jest.fn() as NextFunction;

      // Act
      requirePermission("NON_EXISTENT_PERMISSION")(req, mockResponse, next);

      // Assert
      const error = (next as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe("CONFIG_ERROR");
    });
  });
});
