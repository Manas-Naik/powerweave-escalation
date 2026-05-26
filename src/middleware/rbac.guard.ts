/**
 * @file rbac.guard.ts
 * @description Role-Based Access Control middleware factory.
 *
 * Generates Express middleware that checks whether the authenticated
 * user's role is present in the allowedRoles list. Must be applied
 * after AuthMiddleware (which populates req.user).
 */

import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/app-error";

export type UserRole = "ADMIN" | "MANAGER" | "DEVELOPER" | "VIEWER";

/**
 * Permission map defining which roles can perform each action.
 * Extend this map when adding new permissions.
 */
export const ROLE_PERMISSIONS: Record<string, UserRole[]> = {
  CAN_CREATE_ESCALATION: ["ADMIN", "MANAGER"],
  CAN_UPDATE_ESCALATION_STATUS: ["ADMIN", "MANAGER"],
  CAN_VIEW_ESCALATION: ["ADMIN", "MANAGER", "DEVELOPER", "VIEWER"],
  CAN_TRIGGER_NOTIFICATION: ["ADMIN"],
  CAN_VIEW_ALL_TEAMS: ["ADMIN"],
};

/**
 * Factory function that returns an Express middleware enforcing
 * role-based access control for the given permission.
 *
 * @param permission - The permission key from ROLE_PERMISSIONS
 * @returns Express middleware that rejects unauthorised requests with 403
 *
 * @example
 * router.post("/escalations", requirePermission("CAN_CREATE_ESCALATION"), controller.createEscalation);
 */
export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;

    // Auth middleware should have already rejected unauthenticated requests;
    // this is a safety net for misconfigured route ordering.
    if (!user) {
      return next(new AppError(401, "UNAUTHORISED", "Authentication required"));
    }

    const allowedRoles = ROLE_PERMISSIONS[permission];
    if (!allowedRoles) {
      // Unknown permission key — fail closed (deny by default)
      return next(new AppError(500, "CONFIG_ERROR", `Unknown permission: ${permission}`));
    }

    if (!allowedRoles.includes(user.role as UserRole)) {
      return next(
        new AppError(
          403,
          "FORBIDDEN",
          `Role ${user.role} does not have permission: ${permission}`
        )
      );
    }

    next();
  };
}
