import express, { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { AuditLogger } from "./utils/audit.logger";
import { NotificationService } from "./services/notification.service";
import { EscalationService } from "./services/escalation.service";
import { EscalationController } from "./controllers/escalation.controller";
import { requirePermission } from "./middleware/rbac.guard";
import { AppError } from "./utils/app-error";

const app = express();
app.use(express.json());

const prisma = new PrismaClient();
const auditLogger = new AuditLogger(prisma);
const notificationService = new NotificationService(prisma, auditLogger);
const escalationService = new EscalationService(prisma, notificationService, auditLogger);
const escalationController = new EscalationController(escalationService);

const router = express.Router();

router.post(
  "/escalations",
  requirePermission("CAN_CREATE_ESCALATION"),
  (req: Request, res: Response, next: NextFunction) =>
    escalationController.createEscalation(req, res, next)
);

router.get(
  "/escalations/:id/history",
  requirePermission("CAN_VIEW_ESCALATION"),
  (req: Request, res: Response, next: NextFunction) =>
    escalationController.getEscalationHistory(req, res, next)
);

router.patch(
  "/escalations/:id/status",
  requirePermission("CAN_UPDATE_ESCALATION_STATUS"),
  (req: Request, res: Response, next: NextFunction) =>
    escalationController.updateEscalationStatus(req, res, next)
);

app.use("/api/v1", router);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  console.error("[UnhandledError]", err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Powerweave Escalation Engine running on port ${PORT}`);
});

export default app;
