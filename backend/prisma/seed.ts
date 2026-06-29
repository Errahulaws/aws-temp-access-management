import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('Password123!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@company.com' },
    update: {},
    create: {
      email: 'admin@company.com',
      name: 'Security Admin',
      role: 'APPROVER',
      department: 'Cloud Security',
      password,
    },
  });

  const requester = await prisma.user.upsert({
    where: { email: 'engineer@company.com' },
    update: {},
    create: {
      email: 'engineer@company.com',
      name: 'John Engineer',
      role: 'REQUESTER',
      department: 'Engineering',
      password,
    },
  });

  const auditor = await prisma.user.upsert({
    where: { email: 'auditor@company.com' },
    update: {},
    create: {
      email: 'auditor@company.com',
      name: 'Jane Auditor',
      role: 'AUDITOR',
      department: 'Compliance',
      password,
    },
  });

  const requester2 = await prisma.user.upsert({
    where: { email: 'devops@company.com' },
    update: {},
    create: {
      email: 'devops@company.com',
      name: 'Alex DevOps',
      role: 'REQUESTER',
      department: 'DevOps',
      password,
    },
  });

  // Seed sample access requests
  const now = new Date();

  await prisma.accessRequest.createMany({
    data: [
      {
        requesterId: requester.id,
        secretArns: ['arn:aws:secretsmanager:us-west-2:123456789012:secret:prod/db/postgres-credentials'],
        actionsRequested: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        justification: 'Need access to production database credentials for debugging critical performance issue in user-auth microservice. P1 incident INC-2024-0892.',
        environment: 'prod',
        durationHours: 4,
        status: 'PENDING',
      },
      {
        requesterId: requester.id,
        approverId: admin.id,
        secretArns: ['arn:aws:secretsmanager:us-west-2:123456789012:secret:staging/api/stripe-key'],
        actionsRequested: ['secretsmanager:GetSecretValue'],
        justification: 'Integrating new payment flow in staging environment. Need Stripe API keys for end-to-end testing of checkout module before release v3.2.',
        environment: 'staging',
        durationHours: 48,
        status: 'ACTIVE',
        approvedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        activatedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        expiresAt: new Date(now.getTime() + 46 * 60 * 60 * 1000),
        policyStatementId: 'IAMREQ-staging-stripe',
      },
      {
        requesterId: requester2.id,
        approverId: admin.id,
        secretArns: ['arn:aws:secretsmanager:us-west-2:123456789012:secret:dev/cache/redis-password'],
        actionsRequested: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        justification: 'Setting up Redis cluster in development environment for new caching layer implementation. Sprint task DEV-1234.',
        environment: 'dev',
        durationHours: 168,
        status: 'EXPIRED',
        approvedAt: new Date(now.getTime() - 200 * 60 * 60 * 1000),
        activatedAt: new Date(now.getTime() - 200 * 60 * 60 * 1000),
        expiresAt: new Date(now.getTime() - 32 * 60 * 60 * 1000),
        policyStatementId: 'IAMREQ-dev-redis',
      },
      {
        requesterId: requester2.id,
        secretArns: ['arn:aws:secretsmanager:us-west-2:123456789012:secret:prod/monitoring/datadog-api-key'],
        actionsRequested: ['secretsmanager:GetSecretValue'],
        justification: 'Need Datadog API key to configure monitoring dashboards for the new microservices deployment in production. Operations ticket OPS-567.',
        environment: 'prod',
        durationHours: 24,
        status: 'REJECTED',
        approverId: admin.id,
        rejectedAt: new Date(now.getTime() - 10 * 60 * 60 * 1000),
        rejectionNotes: 'Datadog API key access should go through the monitoring team. Please coordinate with the Observability team for dashboard setup.',
      },
      {
        requesterId: requester.id,
        secretArns: [
          'arn:aws:secretsmanager:us-west-2:123456789012:secret:prod/app/jwt-signing-key',
          'arn:aws:secretsmanager:us-west-2:123456789012:secret:prod/app/encryption-key',
        ],
        actionsRequested: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret', 'secretsmanager:ListSecretVersionIds'],
        justification: 'Key rotation procedure for application signing and encryption keys as part of quarterly security rotation schedule. Change request CR-2024-Q2-043.',
        environment: 'prod',
        durationHours: 2,
        status: 'PENDING',
      },
    ],
    skipDuplicates: true,
  });

  // Seed audit logs for the requests
  const allRequests = await prisma.accessRequest.findMany({
    orderBy: { createdAt: 'asc' },
  });

  for (const request of allRequests) {
    await prisma.auditLog.create({
      data: {
        eventType: 'REQUEST_CREATED',
        requestId: request.id,
        actorId: request.requesterId,
        actorRole: 'requester',
        eventData: {
          secretArns: request.secretArns,
          environment: request.environment,
          durationHours: request.durationHours,
        },
        eventTime: request.createdAt,
      },
    });

    if (request.status === 'ACTIVE' || request.status === 'EXPIRED') {
      await prisma.auditLog.create({
        data: {
          eventType: 'REQUEST_APPROVED',
          requestId: request.id,
          actorId: request.approverId!,
          actorRole: 'approver',
          eventData: { durationHours: request.durationHours },
          eventTime: request.approvedAt!,
        },
      });
      await prisma.auditLog.create({
        data: {
          eventType: 'POLICY_APPLIED',
          requestId: request.id,
          actorId: request.approverId!,
          actorRole: 'system',
          eventData: { policyStatementId: request.policyStatementId },
          eventTime: request.activatedAt!,
        },
      });
    }

    if (request.status === 'REJECTED') {
      await prisma.auditLog.create({
        data: {
          eventType: 'REQUEST_REJECTED',
          requestId: request.id,
          actorId: request.approverId!,
          actorRole: 'approver',
          eventData: { rejectionNotes: request.rejectionNotes },
          eventTime: request.rejectedAt!,
        },
      });
    }

    if (request.status === 'EXPIRED') {
      await prisma.auditLog.create({
        data: {
          eventType: 'POLICY_REVOKED',
          requestId: request.id,
          actorId: null,
          actorRole: 'system',
          eventData: { policyStatementId: request.policyStatementId, autoExpired: true },
          eventTime: request.expiresAt!,
        },
      });
    }
  }

  console.log('Seed data created successfully');
  console.log(`Users: ${admin.email}, ${requester.email}, ${requester2.email}, ${auditor.email}`);
  console.log('Password for all users: Password123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
