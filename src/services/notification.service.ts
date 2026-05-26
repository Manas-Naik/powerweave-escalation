/**
 * @file notification.service.ts
 * @description Dispatches escalation notifications via EMAIL (AWS SES)
 * and IN_APP channels. Resolves role-based recipients and records
 * notification status in the database.
 */

import { PrismaClient } from "@prisma/client";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { AuditLogger } from "../utils/audit.logger";

export interface DispatchInput {
  escalationId: string;
  recipientId: string;
  tier: "L1" | "L2" | "L3";
  taskTitle: string;
  channels: Array<"EMAIL" | "IN_APP">;
  recipientOverrides?: string[];
}

/**
 * Human-readable tier labels used in notification copy.
 */
const TIER_LABELS: Record<string, string> = {
  L1: "Low Priority (L1)",
  L2: "Medium Priority (L2)",
  L3: "Critical (L3)",
};

export class NotificationService {
  private sesClient: SESClient;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditLogger: AuditLogger,
    private readonly fromEmail: string = process.env.SES_FROM_EMAIL ?? "no-reply@powerweave.io"
  ) {
    this.sesClient = new SESClient({ region: process.env.AWS_REGION ?? "ap-south-1" });
  }

  /**
   * Dispatches notifications for an escalation event.
   *
   * For each channel specified:
   * - EMAIL: sends via AWS SES using a pre-built HTML template
   * - IN_APP: creates a notification record in the database
   *
   * If recipientOverrides is provided, those IDs are notified instead
   * of the default recipientId (used for manual re-trigger via API).
   *
   * @param input - Notification dispatch parameters
   */
  async dispatch(input: DispatchInput): Promise<void> {
    const { escalationId, recipientId, tier, taskTitle, channels, recipientOverrides } =
      input;

    // Determine final recipient list
    const recipientIds =
      recipientOverrides && recipientOverrides.length > 0
        ? recipientOverrides
        : [recipientId];

    for (const userId of recipientIds) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      if (!user) {
        console.warn(`[NotificationService] User ${userId} not found, skipping.`);
        continue;
      }

      for (const channel of channels) {
        if (channel === "EMAIL") {
          await this.sendEmail(escalationId, user, tier, taskTitle, userId);
        } else if (channel === "IN_APP") {
          await this.createInAppNotification(escalationId, userId, tier, taskTitle);
        }
      }
    }

    // Log notification dispatched in audit trail
    await this.auditLogger.log({
      escalationId,
      action: "NOTIFIED",
      performedBy: "SYSTEM",
      newValue: { channels, recipientIds },
    });
  }

  /**
   * Sends an HTML escalation email via AWS SES.
   *
   * Records the notification attempt in the `notifications` table
   * with SENT or FAILED status depending on SES response.
   *
   * @param escalationId - For linking the notification record
   * @param user - Recipient's email and display name
   * @param tier - Escalation tier for subject line and body
   * @param taskTitle - Task name to include in the email body
   * @param userId - For the notification DB record
   */
  private async sendEmail(
    escalationId: string,
    user: { email: string; name: string },
    tier: string,
    taskTitle: string,
    userId: string
  ): Promise<void> {
    const subject = `[Powerweave] Task Escalation — ${TIER_LABELS[tier]}: "${taskTitle}"`;
    const htmlBody = this.buildEmailTemplate(user.name, tier, taskTitle, escalationId);

    let status: "SENT" | "FAILED" = "SENT";

    try {
      await this.sesClient.send(
        new SendEmailCommand({
          Source: this.fromEmail,
          Destination: { ToAddresses: [user.email] },
          Message: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: {
              Html: { Data: htmlBody, Charset: "UTF-8" },
            },
          },
        })
      );
    } catch (err) {
      console.error(`[NotificationService] SES send failed for ${user.email}: ${err}`);
      status = "FAILED";
    }

    // Persist notification record regardless of SES outcome
    await this.prisma.notification.create({
      data: {
        escalationId,
        recipientId: userId,
        channel: "EMAIL",
        status,
        sentAt: new Date(),
      },
    });
  }

  /**
   * Creates an in-app notification record for the given escalation.
   * This record is polled by the frontend to display alert badges.
   *
   * @param escalationId - Escalation this notification is for
   * @param userId - Recipient user ID
   * @param tier - Escalation tier for message copy
   * @param taskTitle - Display name of the escalated task
   */
  private async createInAppNotification(
    escalationId: string,
    userId: string,
    tier: string,
    taskTitle: string
  ): Promise<void> {
    await this.prisma.notification.create({
      data: {
        escalationId,
        recipientId: userId,
        channel: "IN_APP",
        status: "SENT",
        sentAt: new Date(),
        message: `Task "${taskTitle}" has been escalated (${TIER_LABELS[tier]}).`,
      },
    });
  }

  /**
   * Builds the HTML email body for escalation notifications.
   * Uses inline styles for maximum email client compatibility.
   *
   * @param recipientName - Manager's display name for personalisation
   * @param tier - Escalation tier to display
   * @param taskTitle - Name of the escalated task
   * @param escalationId - UUID for the "View Escalation" deep link
   * @returns HTML string safe to pass to SES
   */
  private buildEmailTemplate(
    recipientName: string,
    tier: string,
    taskTitle: string,
    escalationId: string
  ): string {
    const dashboardUrl = `${process.env.APP_URL ?? "https://app.powerweave.io"}/escalations/${escalationId}`;

    return `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
          <div style="background: #f44336; padding: 16px; border-radius: 4px 4px 0 0;">
            <h2 style="color: #fff; margin: 0;">Task Escalation Alert</h2>
          </div>
          <div style="padding: 24px; border: 1px solid #e0e0e0; border-top: none;">
            <p>Hi ${recipientName},</p>
            <p>A task has been escalated and requires your attention:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Task</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${taskTitle}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Severity</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${TIER_LABELS[tier]}</td>
              </tr>
            </table>
            <a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background: #1976d2; color: #fff; text-decoration: none; border-radius: 4px;">
              View Escalation
            </a>
            <p style="color: #888; font-size: 12px; margin-top: 24px;">
              This is an automated message from Powerweave. Do not reply to this email.
            </p>
          </div>
        </body>
      </html>
    `;
  }
}
