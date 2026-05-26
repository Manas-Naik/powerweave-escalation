/**
 * @file audit.logger.ts
 * @description Immutable audit trail for escalation lifecycle events.
 *
 * Every create, status change, notification, and resolution action
 * is recorded in the `escalation_audit_logs` table. Records are
 * append-only — no update or delete operations are exposed.
 */

import { PrismaClient, Prisma } from "@prisma/client";

export type AuditAction = "CREATED" | "STATUS_CHANGED" | "NOTIFIED" | "RESOLVED";

export interface AuditLogInput {
  /** UUID of the escalation this log entry belongs to */
  escalationId: string;
  /** The action that occurred */
  action: AuditAction;
  /**
   * UUID of the user who performed the action, or "SYSTEM"
   * for automated cron-triggered actions.
   */
  performedBy: string;
  /** State before the action (null for CREATED events) */
  oldValue?: Record<string, unknown> | null;
  /** State after the action */
  newValue?: Record<string, unknown>;
}

export class AuditLogger {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Appends an immutable audit log entry for an escalation event.
   *
   * This method intentionally never throws to callers — a failed audit
   * log write should not roll back the primary business operation.
   * Errors are logged to the application error log for monitoring.
   *
   * @param input - Audit log data to record
   * @example
   * await auditLogger.log({
   *   escalationId: "uuid-here",
   *   action: "STATUS_CHANGED",
   *   performedBy: "user-uuid",
   *   oldValue: { status: "OPEN" },
   *   newValue: { status: "IN_PROGRESS" }
   * });
   */
  async log(input: AuditLogInput): Promise<void> {
    const { escalationId, action, performedBy, oldValue = null, newValue = {} } = input;

    try {
      await this.prisma.escalationAuditLog.create({
        data: {
          escalationId,
          action,
          performedBy,
          oldValue: (oldValue ?? null) as unknown as Prisma.InputJsonValue,
          newValue: (newValue ?? {}) as unknown as Prisma.InputJsonValue,
          timestamp: new Date(),
        },
      });
    } catch (err) {
      // Non-fatal: log the failure but do not propagate
      console.error(
        `[AuditLogger] Failed to write audit log for escalation ${escalationId}, action ${action}: ${err}`
      );
    }
  }

  /**
   * Retrieves all audit log entries for a given escalation,
   * ordered chronologically (oldest first).
   *
   * Used internally by EscalationService.getHistory().
   * Not directly exposed as an API endpoint.
   *
   * @param escalationId - UUID of the escalation to retrieve logs for
   * @returns Array of audit log entries, oldest first
   */
  async getLogsForEscalation(escalationId: string) {
    return this.prisma.escalationAuditLog.findMany({
      where: { escalationId },
      orderBy: { timestamp: "asc" },
    });
  }
}
