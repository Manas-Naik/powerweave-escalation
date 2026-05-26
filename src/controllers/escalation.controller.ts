/**
 * @file escalation.controller.ts
 * @description HTTP request handlers for the escalation module.
 *
 * Handles incoming REST requests, delegates business logic to
 * EscalationService, and formats HTTP responses. Validation is
 * applied via Zod schemas before any service call is made.
 */

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { EscalationService } from "../services/escalation.service";
import { AppError } from "../utils/app-error";

// ─────────────────────────────────────────────
// Zod Validation Schemas
// ─────────────────────────────────────────────

/**
 * Schema for POST /escalations request body.
 * Enforces required fields, enum values, and string length constraints.
 */
export const CreateEscalationSchema = z.object({
  taskId: z.string().uuid({ message: "taskId must be a valid UUID" }),
  tier: z.enum(["L1", "L2", "L3"], {
    errorMap: () => ({ message: "tier must be one of: L1, L2, L3" }),
  }),
  reason: z
    .string()
    .min(10, "reason must be at least 10 characters")
    .max(500, "reason must not exceed 500 characters"),
  assignedManagerId: z
    .string()
    .uuid({ message: "assignedManagerId must be a valid UUID" })
    .optional(),
});

/**
 * Schema for PATCH /escalations/:id/status request body.
 * resolutionNote is required when transitioning to RESOLVED or CLOSED.
 */
export const UpdateStatusSchema = z
  .object({
    status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
    resolutionNote: z.string().max(1000).optional(),
  })
  .refine(
    (data) => {
      if (["RESOLVED", "CLOSED"].includes(data.status)) {
        return !!data.resolutionNote && data.resolutionNote.trim().length > 0;
      }
      return true;
    },
    {
      message: "resolutionNote is required when status is RESOLVED or CLOSED",
      path: ["resolutionNote"],
    }
  );

// ─────────────────────────────────────────────
// Controller
// ─────────────────────────────────────────────

export class EscalationController {
  constructor(private readonly escalationService: EscalationService) {}

  /**
   * POST /api/v1/escalations
   *
   * Creates a new escalation for an overdue task and immediately
   * triggers notification dispatch to the assigned manager.
   *
   * @access ADMIN, MANAGER
   * @returns 201 with created escalation object
   */
  async createEscalation(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Step 1: Validate request body against schema
      const parseResult = CreateEscalationSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new AppError(400, "VALIDATION_ERROR", "Request body validation failed", {
          details: parseResult.error.issues.map((issue) => ({
            field: issue.path.join("."),
            issue: issue.message,
          })),
        });
      }

      const { taskId, tier, reason, assignedManagerId } = parseResult.data;
      // req.user is populated by AuthMiddleware after JWT verification
      const escalatedBy = req.user!.id;

      // Step 2: Delegate to service layer
      const escalation = await this.escalationService.createEscalation({
        taskId,
        tier,
        reason,
        escalatedBy,
        assignedManagerId,
      });

      res.status(201).json({
        data: escalation,
        message: "Escalation created and notification dispatched",
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/escalations/:id/history
   *
   * Returns the paginated audit log for a given escalation.
   * Results are scoped by team visibility for DEVELOPER/VIEWER roles.
   *
   * @access ALL authenticated roles (scoped by team)
   * @returns 200 with array of audit log entries and pagination metadata
   */
  async getEscalationHistory(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await this.escalationService.getHistory(id, {
        limit,
        offset,
        requestingUser: req.user!,
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/escalations/:id/status
   *
   * Updates escalation status. Enforces valid state transitions:
   * OPEN → IN_PROGRESS → RESOLVED → CLOSED
   *
   * @access MANAGER, ADMIN
   * @returns 200 with updated escalation object
   */
  async updateEscalationStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;

      const parseResult = UpdateStatusSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new AppError(400, "VALIDATION_ERROR", "Request body validation failed", {
          details: parseResult.error.issues.map((issue) => ({
            field: issue.path.join("."),
            issue: issue.message,
          })),
        });
      }

      const updatedEscalation = await this.escalationService.updateStatus(
        id,
        parseResult.data,
        req.user!.id
      );

      res.status(200).json({
        data: updatedEscalation,
        message: `Escalation status updated to ${parseResult.data.status}`,
      });
    } catch (err) {
      next(err);
    }
  }
}
