import { UserRole } from "../middleware/rbac.guard";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
        teamId: string;
      };
    }
  }
}
