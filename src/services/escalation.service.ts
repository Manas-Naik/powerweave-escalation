/**
 * @file escalation.service.ts
 * @description Core business logic for the escalation module.
 *
 * Orchestrates task validation, escalation creation, state-machine
 * transitions, and coordination between the notification service
 * and audit logger. This layer is free of HTTP concerns.
 */

import { PrismaClient, Escalation, EscalationStatus, EscalationTier } from "@prisma/client";
import { NotificationService } from "./notification.service";
import { AuditLogger } from "../utils/audit.logger";
import { AppError } from "../utils/app-error";

/**
 * Valid escalation status transition map.
 * Key: current status. Value: allowed next statuses.
 */
const VALID_TRANSITIONS: Record<EscalationStatus, EscalationStatus[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
};

export interface CreateEscalationInput {
  taskId: string;
  tier: EscalationTier;
  reason: string;
  escalatedBy: string;
  assignedManagerId?: string;
}

export interface UpdateStatusInput {
  status: EscalationStatus;
  resolutionNote?: string;
}

export interface GetHistoryOptions {
  limit: number;
  offset: number;
  requestingUser: { id: string; role: string; teamId: string };
}

export class EscalationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notificationService: NotificationService,
    private readonly auditLogger: AuditLogger
  ) {}

  /**
   * Creates a new escalation for an overdue task.
   *
   * Workflow:
   * 1. Verify the task exists and is not already escalated
   * 2. Resolve the assigned manager (from input or team default)
   * 3. Persist the escalation record
   * 4. Write an audit log entry (CREATED action)
   * 5. Dispatch notifications asynchronously
   *
   * @param input - Escalation creation parameters
   * @returns The newly created escalation record
   * @throws AppError(404) if task does not exist
   * @throws AppError(409) if an active escalation already exists for the task
   */
  async createEscalation(input: CreateEscalationInput): Promise<Escalation> {
    const { taskId, tier, reason, escalatedBy, assignedManagerId } = input;

    // 1. Verify task exists
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new AppError(404, "TASK_NOT_FOUND", `Task ${taskId} does not exist`);
    }

    // 2. Check for existing active escalation
    const existing = await this.prisma.escalation.findFirst({
      where: {
        taskId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    });
    if (existing) {
      throw new AppError(
        409,
        "DUPLICATE_ESCALATION",
        `An active escalation already exists for task ${taskId}`
      );
    }

    // 3. Resolve manager: use provided ID or fall back to team's default manager
    const resolvedManagerId =
      assignedManagerId ?? (await this.resolveTeamManager(task.teamId));

    // 4. Persist escalation
    const escalation = await this.prisma.escalation.create({
      data: {
        taskId,
        tier,
        reason,
        status: "OPEN",
        escalatedBy,
        assignedManager: resolvedManagerId,
      },
    });

    // 5. Audit log
    await this.auditLogger.log({
      escalationId: escalation.id,
      action: "CREATED",
      performedBy: escalatedBy,
      newValue: { status: "OPEN", tier, reason },
    });

    // 6. Dispatch notification (non-blocking — failure does not roll back escalation)
    this.notificationService
      .dispatch({
        escalationId: escalation.id,
        recipientId: resolvedManagerId,
        tier,
        taskTitle: task.title,
        channels: ["EMAIL", "IN_APP"],
      })
      .catch((err) => {
        // Log notification failure but do not surface to caller
        console.error(`[EscalationService] Notification dispatch failed: ${err.message}`);
      });

    return escalation;
  }

  /**
   * Updates the status of an existing escalation, enforcing
   * the valid state machine transitions.
   *
   * @param escalationId - UUID of the escalation to update
   * @param input - New status and optional resolution note
   * @param performedBy - UUID of the user performing the update
   * @returns The updated escalation record
   * @throws AppError(404) if escalation not found
   * @throws AppError(400) if the status transition is invalid
   */
  async updateStatus(
    escalationId: string,
    input: UpdateStatusInput,
    performedBy: string
  ): Promise<Escalation> {
    const { status: newStatus, resolutionNote } = input;

    const escalation = await this.prisma.escalation.findUnique({
      where: { id: escalationId },
    });
    if (!escalation) {
      throw new AppError(404, "ESCALATION_NOT_FOUND", `Escalation ${escalationId} not found`);
    }

    // Enforce state machine
    const allowedTransitions = VALID_TRANSITIONS[escalation.status];
    if (!allowedTransitions.includes(newStatus)) {
      throw new AppError(
        400,
        "INVALID_TRANSITION",
        `Cannot transition from ${escalation.status} to ${newStatus}`
      );
    }

    const updated = await this.prisma.escalation.update({
      where: { id: escalationId },
      data: {
        status: newStatus,
        resolvedAt: ["RESOLVED", "CLOSED"].includes(newStatus) ? new Date() : undefined,
        resolutionNote: resolutionNote ?? undefined,
      },
    });

    await this.auditLogger.log({
      escalationId,
      action: "STATUS_CHANGED",
      performedBy,
      oldValue: { status: escalation.status },
      newValue: { status: newStatus, resolutionNote },
    });

    return updated;
  }

  /**
   * Retrieves paginated audit history for a given escalation.
   * Results are team-scoped for DEVELOPER and VIEWER roles.
   *
   * @param escalationId - UUID of the escalation
   * @param options - Pagination and requesting user details
   * @returns Audit log entries with pagination metadata
   */
  async getHistory(
    escalationId: string,
    options: GetHistoryOptions
  ): Promise<{ data: unknown[]; pagination: object }> {
    const { limit, offset, requestingUser } = options;

    const escalation = await this.prisma.escalation.findUnique({
      where: { id: escalationId },
      include: { task: true },
    });
    if (!escalation) {
      throw new AppError(404, "ESCALATION_NOT_FOUND", `Escalation ${escalationId} not found`);
    }

    // Scope check: DEVELOPER/VIEWER can only see their team's escalations
    if (
      ["DEVELOPER", "VIEWER"].includes(requestingUser.role) &&
      escalation.task.teamId !== requestingUser.teamId
    ) {
      throw new AppError(403, "FORBIDDEN", "Access denied to this escalation");
    }

    const [entries, total] = await this.prisma.$transaction([
      this.prisma.escalationAuditLog.findMany({
        where: { escalationId },
        orderBy: { timestamp: "asc" },
        skip: offset,
        take: limit,
      }),
      this.prisma.escalationAuditLog.count({ where: { escalationId } }),
    ]);

    return {
      data: entries,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + entries.length < total,
      },
    };
  }

  /**
   * Resolves the default manager for a given team.
   * Falls back to a platform-wide admin UUID if no team manager is set.
   *
   * @param teamId - The team whose manager to look up
   * @returns Manager's user UUID
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
}
