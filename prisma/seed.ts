import { PrismaClient, UserRole, EscalationTier, EscalationStatus } from "@prisma/client";

const prisma = new PrismaClient();

// Stable UUIDs for repeatable seeding
const IDs = {
  teams:       { alpha: "00000000-0000-0000-0000-000000000001", beta:  "00000000-0000-0000-0000-000000000002" },
  users:       { admin: "00000000-0000-0000-0000-000000000011", mgrA:  "00000000-0000-0000-0000-000000000012",
                 mgrB:  "00000000-0000-0000-0000-000000000013", dev:   "00000000-0000-0000-0000-000000000014",
                 viewer:"00000000-0000-0000-0000-000000000015" },
  tasks:       { t1:    "00000000-0000-0000-0000-000000000021", t2:    "00000000-0000-0000-0000-000000000022",
                 t3:    "00000000-0000-0000-0000-000000000023" },
  escalations: { e1:    "00000000-0000-0000-0000-000000000031", e2:    "00000000-0000-0000-0000-000000000032",
                 e3:    "00000000-0000-0000-0000-000000000033" },
  logs:        { l1:    "00000000-0000-0000-0000-000000000041", l2:    "00000000-0000-0000-0000-000000000042",
                 l3:    "00000000-0000-0000-0000-000000000043" },
};

async function main() {
  console.log("Clearing existing data...");
  await prisma.escalationAuditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.escalation.deleteMany();
  await prisma.task.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();

  console.log("Seeding...");

  // Teams (no manager yet — users reference teams)
  await prisma.team.createMany({
    data: [
      { id: IDs.teams.alpha, name: "Team Alpha" },
      { id: IDs.teams.beta,  name: "Team Beta"  },
    ],
  });

  // Users
  await prisma.user.createMany({
    data: [
      { id: IDs.users.admin,  email: "admin@powerweave.io",           name: "Alice Admin",    role: UserRole.ADMIN,     teamId: IDs.teams.alpha },
      { id: IDs.users.mgrA,   email: "manager.alpha@powerweave.io",   name: "Bob Manager",    role: UserRole.MANAGER,   teamId: IDs.teams.alpha },
      { id: IDs.users.mgrB,   email: "manager.beta@powerweave.io",    name: "Carol Manager",  role: UserRole.MANAGER,   teamId: IDs.teams.beta  },
      { id: IDs.users.dev,    email: "dev1@powerweave.io",            name: "Dave Developer", role: UserRole.DEVELOPER, teamId: IDs.teams.alpha },
      { id: IDs.users.viewer, email: "viewer@powerweave.io",          name: "Eve Viewer",     role: UserRole.VIEWER,    teamId: IDs.teams.beta  },
    ],
  });

  // Assign managers to teams
  await prisma.team.update({ where: { id: IDs.teams.alpha }, data: { managerId: IDs.users.mgrA } });
  await prisma.team.update({ where: { id: IDs.teams.beta  }, data: { managerId: IDs.users.mgrB } });

  // Tasks
  await prisma.task.createMany({
    data: [
      { id: IDs.tasks.t1, title: "Implement OAuth2 login flow",          teamId: IDs.teams.alpha },
      { id: IDs.tasks.t2, title: "Fix production API latency regression", teamId: IDs.teams.alpha },
      { id: IDs.tasks.t3, title: "Deploy hotfix for data export bug",     teamId: IDs.teams.beta  },
    ],
  });

  // Escalations
  await prisma.escalation.createMany({
    data: [
      {
        id: IDs.escalations.e1,
        taskId: IDs.tasks.t1, tier: EscalationTier.L1,
        reason: "Task has been overdue for 3 days with no update from assignee.",
        status: EscalationStatus.OPEN,
        escalatedBy: IDs.users.admin, assignedManager: IDs.users.mgrA,
      },
      {
        id: IDs.escalations.e2,
        taskId: IDs.tasks.t2, tier: EscalationTier.L3,
        reason: "Critical performance degradation affecting all production users. P95 latency up 400%.",
        status: EscalationStatus.IN_PROGRESS,
        escalatedBy: IDs.users.admin, assignedManager: IDs.users.mgrA,
      },
      {
        id: IDs.escalations.e3,
        taskId: IDs.tasks.t3, tier: EscalationTier.L2,
        reason: "Data export feature broken for enterprise customers since last deployment.",
        status: EscalationStatus.RESOLVED,
        escalatedBy: IDs.users.mgrB, assignedManager: IDs.users.mgrB,
        resolvedAt: new Date(),
        resolutionNote: "Hotfix deployed to production. Export pipeline restored.",
      },
    ],
  });

  // Audit logs
  await prisma.escalationAuditLog.createMany({
    data: [
      {
        id: IDs.logs.l1, escalationId: IDs.escalations.e1,
        action: "CREATED", performedBy: IDs.users.admin,
        newValue: { status: "OPEN", tier: "L1" },
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        id: IDs.logs.l2, escalationId: IDs.escalations.e2,
        action: "CREATED", performedBy: IDs.users.admin,
        newValue: { status: "OPEN", tier: "L3" },
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
      {
        id: IDs.logs.l3, escalationId: IDs.escalations.e2,
        action: "STATUS_CHANGED", performedBy: IDs.users.mgrA,
        oldValue: { status: "OPEN" },
        newValue: { status: "IN_PROGRESS" },
        timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
      },
    ],
  });

  console.log("Seed complete: 2 teams, 5 users, 3 tasks, 3 escalations, 3 audit logs");
  console.log("\nUseful IDs for testing:");
  console.log(`  Task (t3, no escalation): ${IDs.tasks.t3}`);
  console.log(`  Escalation e1 (OPEN):     ${IDs.escalations.e1}`);
  console.log(`  Escalation e2 (IN_PROG):  ${IDs.escalations.e2}`);
  console.log(`  Admin user:               ${IDs.users.admin}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
