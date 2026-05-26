import { PrismaClient, UserRole, EscalationTier, EscalationStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Teams
  const teamA = await prisma.team.upsert({
    where: { id: "team-alpha-0000-0000-000000000001" },
    update: {},
    create: {
      id: "team-alpha-0000-0000-000000000001",
      name: "Team Alpha",
    },
  });

  const teamB = await prisma.team.upsert({
    where: { id: "team-beta-00000-0000-000000000002" },
    update: {},
    create: {
      id: "team-beta-00000-0000-000000000002",
      name: "Team Beta",
    },
  });

  // Users
  const admin = await prisma.user.upsert({
    where: { email: "admin@powerweave.io" },
    update: {},
    create: {
      id: "user-admin-0000-0000-000000000001",
      email: "admin@powerweave.io",
      name: "Alice Admin",
      role: UserRole.ADMIN,
      teamId: teamA.id,
    },
  });

  const managerA = await prisma.user.upsert({
    where: { email: "manager.alpha@powerweave.io" },
    update: {},
    create: {
      id: "user-mgr-a-0000-0000-000000000002",
      email: "manager.alpha@powerweave.io",
      name: "Bob Manager",
      role: UserRole.MANAGER,
      teamId: teamA.id,
    },
  });

  const managerB = await prisma.user.upsert({
    where: { email: "manager.beta@powerweave.io" },
    update: {},
    create: {
      id: "user-mgr-b-0000-0000-000000000003",
      email: "manager.beta@powerweave.io",
      name: "Carol Manager",
      role: UserRole.MANAGER,
      teamId: teamB.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "dev1@powerweave.io" },
    update: {},
    create: {
      id: "user-dev-1-0000-0000-000000000004",
      email: "dev1@powerweave.io",
      name: "Dave Developer",
      role: UserRole.DEVELOPER,
      teamId: teamA.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "viewer@powerweave.io" },
    update: {},
    create: {
      id: "user-viewer-0000-0000-000000000005",
      email: "viewer@powerweave.io",
      name: "Eve Viewer",
      role: UserRole.VIEWER,
      teamId: teamB.id,
    },
  });

  // Assign managers to teams
  await prisma.team.update({
    where: { id: teamA.id },
    data: { managerId: managerA.id },
  });

  await prisma.team.update({
    where: { id: teamB.id },
    data: { managerId: managerB.id },
  });

  // Tasks
  const task1 = await prisma.task.upsert({
    where: { id: "task-00000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "task-00000-0000-0000-000000000001",
      title: "Implement OAuth2 login flow",
      teamId: teamA.id,
    },
  });

  const task2 = await prisma.task.upsert({
    where: { id: "task-00000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "task-00000-0000-0000-000000000002",
      title: "Fix production API latency regression",
      teamId: teamA.id,
    },
  });

  const task3 = await prisma.task.upsert({
    where: { id: "task-00000-0000-0000-000000000003" },
    update: {},
    create: {
      id: "task-00000-0000-0000-000000000003",
      title: "Deploy hotfix for data export bug",
      teamId: teamB.id,
    },
  });

  // Escalations
  const esc1 = await prisma.escalation.upsert({
    where: { id: "esc-000000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "esc-000000-0000-0000-000000000001",
      taskId: task1.id,
      tier: EscalationTier.L1,
      reason: "Task has been overdue for 3 days with no update from assignee.",
      status: EscalationStatus.OPEN,
      escalatedBy: admin.id,
      assignedManager: managerA.id,
    },
  });

  const esc2 = await prisma.escalation.upsert({
    where: { id: "esc-000000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "esc-000000-0000-0000-000000000002",
      taskId: task2.id,
      tier: EscalationTier.L3,
      reason: "Critical performance degradation affecting all production users. P95 latency up 400%.",
      status: EscalationStatus.IN_PROGRESS,
      escalatedBy: admin.id,
      assignedManager: managerA.id,
    },
  });

  await prisma.escalation.upsert({
    where: { id: "esc-000000-0000-0000-000000000003" },
    update: {},
    create: {
      id: "esc-000000-0000-0000-000000000003",
      taskId: task3.id,
      tier: EscalationTier.L2,
      reason: "Data export feature broken for enterprise customers since last deployment.",
      status: EscalationStatus.RESOLVED,
      escalatedBy: managerB.id,
      assignedManager: managerB.id,
      resolvedAt: new Date(),
      resolutionNote: "Hotfix deployed to production. Export pipeline restored.",
    },
  });

  // Audit logs
  await prisma.escalationAuditLog.createMany({
    skipDuplicates: true,
    data: [
      {
        id: "log-000000-0000-0000-000000000001",
        escalationId: esc1.id,
        action: "CREATED",
        performedBy: admin.id,
        newValue: { status: "OPEN", tier: "L1" },
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        id: "log-000000-0000-0000-000000000002",
        escalationId: esc2.id,
        action: "CREATED",
        performedBy: admin.id,
        newValue: { status: "OPEN", tier: "L3" },
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
      {
        id: "log-000000-0000-0000-000000000003",
        escalationId: esc2.id,
        action: "STATUS_CHANGED",
        performedBy: managerA.id,
        oldValue: { status: "OPEN" },
        newValue: { status: "IN_PROGRESS" },
        timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
      },
    ],
  });

  console.log("Seed complete:");
  console.log(`  2 teams, 5 users, 3 tasks, 3 escalations, 3 audit logs`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
