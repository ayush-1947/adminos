import express from 'express';
import { readCalendar, saveCalendar, saveCalendarDay } from './modules/attendance/calendar';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import pinoHttp from 'pino-http';
import pino from 'pino';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z, ZodError } from 'zod';
import { config } from './config';
import { db } from './lib/db';
import { assert, HttpError } from './lib/errors';
import { authenticate, digest, login, newToken } from './modules/auth/service';
import { requirePermission } from './modules/auth/policy';
import { createUser } from './modules/auth/admin';
import { orgChart } from './modules/profiles/org-chart';
import { catalog, permissionKeys } from './modules/resources/catalog';
import { list, detail, save } from './modules/resources/service';
import { scopeFor } from './modules/resources/scope';
import { dashboard } from './modules/analytics/service';
import {
  staffOverview,
  clockStaff,
  manualStaff,
  requestLeave,
  reviewLeave,
  staffPhoto,
} from './modules/attendance/staff';
import { flowRouter, webhookRouter } from './modules/flowbridge/service';
import { recordTap } from './modules/attendance/service';
import { attendanceRegister, saveAttendanceRegister } from './modules/attendance/manual';
import { exportReport } from './modules/reports/service';
import { upload, download } from './modules/documents/service';
import { refreshNotifications } from './modules/notifications/service';
import { listPdfs, savePdf, downloadPdf } from './modules/billing/service';
import {
  getProfile,
  updateProfile,
  uploadAsset,
  readAsset,
  addPayment,
} from './modules/profiles/service';
export const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: [
    'req.headers.cookie',
    'req.headers.authorization',
    'req.headers["x-device-key"]',
    'req.body',
    'res.headers["set-cookie"]',
  ],
});
export const app = express();
app.disable('x-powered-by');
if (config.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: config.APP_ORIGIN, credentials: true }));
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(pinoHttp({ logger, genReqId: (req) => (req as express.Request).requestId }));
// Render checks the service root during startup. Send browser visits to the UI
// and keep infrastructure probes outside application request quotas.
app.head('/', (_req, res) => res.status(200).end());
app.get('/', (_req, res) => res.redirect(302, config.APP_ORIGIN));
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/ready', async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ status: 'ready' });
});

app.use(
  '/api',
  rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }),
);
app.use('/api/flowbridge/webhook', webhookRouter);
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.post('/api/attendance/tap', rateLimit({ windowMs: 60000, limit: 120 }), async (req, res) => {
  const key = req.get('x-device-key');
  assert(key, 401, 'Attendance device key required');
  res.json(await recordTap(key, req.body));
});
app.use('/api', (req, _res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method))
    assert(req.get('origin') === config.APP_ORIGIN, 403, 'Request origin is not allowed');
  next();
});
const cookieOptions = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api',
  maxAge: 8 * 3600000,
};
app.post(
  '/api/auth/login',
  rateLimit({ windowMs: 15 * 60000, limit: 10, skipSuccessfulRequests: true }),
  async (req, res) => {
    const body = z
      .strictObject({ email: z.email(), password: z.string().min(1).max(128) })
      .parse(req.body);
    const token = await login(body.email, body.password, req.requestId);
    res.cookie('os_session', token, cookieOptions).json({ ok: true });
  },
);
app.use('/api', async (req, _res, next) => {
  const token = req.cookies.os_session;
  assert(typeof token === 'string', 401, 'Sign in to continue');
  const principal = await authenticate(token);
  assert(principal, 401, 'Session expired. Sign in again');
  req.principal = principal;
  next();
});
app.get('/api/auth/me', async (req, res) => {
  const p = req.principal;
  const [user, organization, businessUnits] = await Promise.all([
    db.user.findUnique({ where: { id: p.userId }, select: { id: true, name: true, email: true } }),
    db.organization.findUnique({
      where: { id: p.organizationId },
      select: { id: true, name: true },
    }),
    db.businessUnit.findMany({
      where: {
        organizationId: p.organizationId,
        deletedAt: null,
        ...(p.scope !== 'ORGANIZATION' ? { id: p.businessUnitId || '' } : {}),
      },
      select: { id: true, name: true, code: true },
    }),
  ]);
  res.json({ user, organization, businessUnits, principal: p });
});
app.use('/api/flowbridge', flowRouter);
app.get('/api/admin/work-calendar', async (req, res) =>
  res.json(await readCalendar(req.principal, req.query)),
);
app.put('/api/admin/work-calendar', async (req, res) =>
  res.json(await saveCalendar(req.principal, req.body, req.requestId)),
);
app.put('/api/admin/work-calendar/day', async (req, res) =>
  res.json(await saveCalendarDay(req.principal, req.body, req.requestId)),
);
app.get('/api/staff-attendance', async (req, res) => res.json(await staffOverview(req.principal)));
app.post('/api/staff-attendance/manual', async (req, res) =>
  res.json(await manualStaff(req.principal, req.body, req.requestId)),
);
app.post('/api/staff-attendance/leaves', async (req, res) =>
  res.status(201).json(await requestLeave(req.principal, req.body)),
);
app.patch('/api/staff-attendance/leaves/:id', async (req, res) =>
  res.json(await reviewLeave(req.principal, String(req.params.id), req.body, req.requestId)),
);
app.get('/api/staff-attendance/:id/photo/:kind', async (req, res) => {
  assert(['start', 'stop'].includes(String(req.params.kind)), 404, 'Photo not found');
  const f = await staffPhoto(req.principal, String(req.params.id), req.params.kind === 'stop');
  res.type(f.mime).send(Buffer.from(f.content));
});
app.get('/api/org-chart', async (req, res) => res.json(await orgChart(req.principal)));
app.get('/api/attendance/register', async (req, res) =>
  res.json(await attendanceRegister(req.principal, req.query)),
);
app.post('/api/attendance/register', async (req, res) =>
  res.json(await saveAttendanceRegister(req.principal, req.body, req.requestId)),
);
app.post('/api/auth/logout', async (req, res) => {
  await db.session.deleteMany({
    where: { tokenHash: digest(req.cookies.os_session), userId: req.principal.userId },
  });
  res.clearCookie('os_session', { ...cookieOptions, maxAge: undefined }).json({ ok: true });
});
app.get('/api/catalog', (req, res) =>
  res.json(
    Object.fromEntries(
      Object.entries(catalog)
        .filter(([key]) => req.principal.permissions.includes(`${key}:read`))
        .map(([key, r]) => [
          key,
          { ...r, canWrite: !r.readonly && req.principal.permissions.includes(`${key}:write`) },
        ]),
    ),
  ),
);
app.get('/api/customer/team', async (req, res) => {
  const p = req.principal;
  assert(p.role === 'Customer', 403, 'Customer access required');
  const now = new Date();
  const sites = await db.site.findMany({
    where: scopeFor('sites', p),
    select: {
      id: true,
      name: true,
      address: true,
      manager: { select: { id: true, name: true, deletedAt: true } },
      supervisor: { select: { id: true, name: true, deletedAt: true } },
      siteAssignment_site: {
        where: {
          deletedAt: null,
          startDate: { lte: now },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
          employee: { deletedAt: null, status: 'ACTIVE', position: 'WORKER' },
        },
        select: { employee: { select: { id: true, name: true } } },
      },
    },
    orderBy: { name: 'asc' },
  });
  res.json(
    sites.map(({ siteAssignment_site, manager, supervisor, ...site }) => ({
      ...site,
      manager: manager && !manager.deletedAt ? { id: manager.id, name: manager.name } : null,
      supervisor:
        supervisor && !supervisor.deletedAt ? { id: supervisor.id, name: supervisor.name } : null,
      workers: [...new Map(siteAssignment_site.map((a) => [a.employee.id, a.employee])).values()],
    })),
  );
});
app.get('/api/dashboard', async (req, res) => res.json(await dashboard(req.principal, req.query)));
app.get('/api/resources/:key', async (req, res) =>
  res.json(await list(String(req.params.key), req.principal, req.query)),
);
app.get('/api/resources/:key/:id', async (req, res) =>
  res.json(await detail(String(req.params.key), String(req.params.id), req.principal)),
);
app.post('/api/resources/:key', async (req, res) =>
  res
    .status(201)
    .json(await save(String(req.params.key), null, req.body, req.principal, req.requestId)),
);
app.patch('/api/resources/:key/:id', async (req, res) =>
  res.json(
    await save(
      String(req.params.key),
      String(req.params.id),
      req.body,
      req.principal,
      req.requestId,
    ),
  ),
);
app.get('/api/reports/:key/:format', async (req, res) => {
  const format = z.enum(['csv', 'xlsx', 'pdf']).parse(req.params.format);
  await exportReport(String(req.params.key), format, req.principal, req.query, res);
});
app.get('/api/billing/:key/:id/pdfs', async (req, res) =>
  res.json(await listPdfs(String(req.params.key), String(req.params.id), req.principal)),
);
app.post('/api/billing/:key/:id/pdfs', async (req, res) =>
  res
    .status(201)
    .json(
      await savePdf(
        String(req.params.key),
        String(req.params.id),
        req.body,
        req.principal,
        req.requestId,
      ),
    ),
);
app.get('/api/saved-pdfs/:id/download', async (req, res) => {
  const file = await downloadPdf(String(req.params.id), req.principal);
  res.attachment(file.filename).type('application/pdf').send(file.content);
});
let activeUploads = 0;
app.use(
  ['/api/documents', '/api/profiles/:type/:id/assets', '/api/staff-attendance/clock'],
  (req, res, next) => {
    if (req.method !== 'POST') return next();
    if (activeUploads >= 4) {
      res.status(503).json({ error: 'Uploads are busy. Try again shortly.' });
      return;
    }
    activeUploads++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        activeUploads--;
      }
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  },
);
const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 6 },
});
const staffUploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 7 },
});
app.post('/api/staff-attendance/clock', staffUploader.single('photo'), async (req, res) =>
  res.json(await clockStaff(req.principal, req.body, req.file, req.requestId)),
);
app.get('/api/profiles/:type/:id', async (req, res) =>
  res.json(await getProfile(String(req.params.type), String(req.params.id), req.principal)),
);
app.patch('/api/profiles/:type/:id', async (req, res) =>
  res.json(
    await updateProfile(
      String(req.params.type),
      String(req.params.id),
      req.body,
      req.principal,
      req.requestId,
    ),
  ),
);
app.post('/api/profiles/:type/:id/assets', uploader.single('file'), async (req, res) =>
  res
    .status(201)
    .json(
      await uploadAsset(
        String(req.params.type),
        String(req.params.id),
        req.body,
        req.file,
        req.principal,
        req.requestId,
      ),
    ),
);
app.get('/api/profiles/:type/:id/assets/:assetId', async (req, res) => {
  const asset = await readAsset(
    String(req.params.type),
    String(req.params.id),
    String(req.params.assetId),
    req.principal,
    req.requestId,
  );
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Disposition',
    `${req.query.download === '1' || asset.mimeType === 'application/pdf' ? 'attachment' : 'inline'}; filename="${asset.name}"`,
  );
  res.type(asset.mimeType).send(Buffer.from(asset.content));
});
app.post('/api/profiles/:type/:id/payments', async (req, res) =>
  res
    .status(201)
    .json(
      await addPayment(
        String(req.params.type),
        String(req.params.id),
        req.body,
        req.principal,
        req.requestId,
      ),
    ),
);
app.post('/api/documents', uploader.single('file'), async (req, res) =>
  res.status(201).json(await upload(req.file, req.body, req.principal, req.requestId)),
);
app.get('/api/documents/:id/download', async (req, res) =>
  res.json(await download(String(req.params.id), req.principal)),
);
app.post('/api/notifications/refresh', async (req, res) => {
  requirePermission(req.principal, 'notifications:read');
  res.json(await refreshNotifications(req.principal));
});
app.patch('/api/notifications/:id/read', async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const result = await db.notification.updateMany({
    where: { id, userId: req.principal.userId, organizationId: req.principal.organizationId },
    data: { readAt: new Date(), updatedBy: req.principal.userId },
  });
  assert(result.count, 404, 'Notification not found');
  res.json({ ok: true });
});
app.get('/api/admin/users', async (req, res) => {
  requirePermission(req.principal, 'users:manage');
  res.json(
    await db.user.findMany({
      where: { organizationId: req.principal.organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        role: { select: { name: true, id: true } },
        businessUnitId: true,
      },
      take: 500,
    }),
  );
});
app.post('/api/admin/users', async (req, res) =>
  res.status(201).json(await createUser(req.body, req.principal, req.requestId)),
);
app.get('/api/admin/roles', async (req, res) => {
  requirePermission(req.principal, 'users:manage');
  res.json({
    roles: await db.role.findMany({
      where: { organizationId: req.principal.organizationId, deletedAt: null },
      include: { rolePermission_role: { include: { permission: true } } },
    }),
    permissions: permissionKeys,
  });
});
app.patch('/api/admin/users/:id/status', async (req, res) => {
  requirePermission(req.principal, 'users:manage');
  assert(req.principal.scope === 'ORGANIZATION', 403, 'Organization administrator required');
  const id = z.uuid().parse(req.params.id);
  const { status } = z.strictObject({ status: z.enum(['ACTIVE', 'INACTIVE']) }).parse(req.body);
  assert(id !== req.principal.userId, 422, 'You cannot deactivate your own account');
  await db.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { id, organizationId: req.principal.organizationId },
    });
    assert(user, 404, 'User not found');
    await tx.user.update({ where: { id }, data: { status, updatedBy: req.principal.userId } });
    await tx.session.deleteMany({ where: { userId: id } });
    await tx.auditLog.create({
      data: {
        organizationId: req.principal.organizationId,
        actorId: req.principal.userId,
        action: 'USER_STATUS',
        entity: 'user',
        entityId: id,
        previousValue: { status: user.status },
        newValue: { status },
        requestId: req.requestId,
      },
    });
  });
  res.json({ ok: true });
});
app.put('/api/admin/roles/:id/permissions', async (req, res) => {
  requirePermission(req.principal, 'users:manage');
  assert(req.principal.scope === 'ORGANIZATION', 403, 'Organization administrator required');
  const id = z.uuid().parse(req.params.id);
  const { permissions } = z
    .strictObject({
      permissions: z.array(z.enum(permissionKeys as [string, ...string[]])).max(200),
    })
    .parse(req.body);
  await db.$transaction(async (tx) => {
    const role = await tx.role.findFirst({
      where: { id, organizationId: req.principal.organizationId },
      include: { rolePermission_role: { include: { permission: true } } },
    });
    assert(role, 404, 'Role not found');
    assert(
      role.name !== 'Super Admin',
      422,
      'The bootstrap administrator permission set is protected',
    );
    await tx.rolePermission.deleteMany({
      where: { roleId: id, organizationId: req.principal.organizationId },
    });
    const values = await tx.permission.findMany({ where: { key: { in: permissions } } });
    await tx.rolePermission.createMany({
      data: values.map((v) => ({
        organizationId: req.principal.organizationId,
        roleId: id,
        permissionId: v.id,
        createdBy: req.principal.userId,
      })),
    });
    await tx.auditLog.create({
      data: {
        organizationId: req.principal.organizationId,
        actorId: req.principal.userId,
        action: 'PERMISSION_CHANGE',
        entity: 'role',
        entityId: id,
        previousValue: role.rolePermission_role.map((r) => r.permission.key),
        newValue: permissions,
        requestId: req.requestId,
      },
    });
  });
  res.json({ ok: true });
});
app.post('/api/admin/devices', async (req, res) => {
  requirePermission(req.principal, 'devices:manage');
  const body = z
    .strictObject({ name: z.string().min(2).max(100), siteId: z.uuid() })
    .parse(req.body);
  const site = await db.site.findFirst({
    where: { AND: [scopeFor('sites', req.principal), { id: body.siteId }] },
  });
  assert(site, 404, 'Site not found');
  const key = newToken();
  const device = await db.attendanceDevice.create({
    data: {
      organizationId: req.principal.organizationId,
      businessUnitId: site.businessUnitId,
      siteId: site.id,
      name: body.name,
      keyHash: digest(key),
      createdBy: req.principal.userId,
    },
    select: { id: true, name: true, siteId: true },
  });
  res.status(201).json({ ...device, key });
});
app.post('/api/admin/cards', async (req, res) => {
  requirePermission(req.principal, 'devices:manage');
  const body = z
    .strictObject({ employeeId: z.uuid(), cardId: z.string().min(4).max(200) })
    .parse(req.body);
  const employee = await db.employee.findFirst({
    where: { AND: [scopeFor('employees', req.principal), { id: body.employeeId }] },
  });
  assert(employee, 404, 'Employee not found');
  const card = await db.nfcCard.create({
    data: {
      organizationId: req.principal.organizationId,
      employeeId: employee.id,
      name: `Card for ${employee.employeeCode}`,
      cardHash: digest(body.cardId),
      createdBy: req.principal.userId,
    },
    select: { id: true, name: true, status: true },
  });
  res.status(201).json(card);
});
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
app.use(
  (error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    if (error instanceof ZodError) {
      res.status(422).json({
        error: 'Check the form fields',
        details: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        requestId: req.requestId,
      });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message, requestId: req.requestId });
      return;
    }
    // Body-parser errors carry the submitted body; do not log them as internal errors.
    const bodyError = error as { type?: string } | null;
    if (bodyError?.type === 'entity.parse.failed' || bodyError?.type === 'entity.too.large') {
      const tooLarge = bodyError.type === 'entity.too.large';
      res.status(tooLarge ? 413 : 400).json({
        error: tooLarge ? 'Request body exceeds the 256 KB limit' : 'Malformed JSON request',
        requestId: req.requestId,
      });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const message =
        error.code === 'P2002'
          ? 'This record already exists'
          : error.code === 'P2034'
            ? 'Another update happened at the same time. Please retry'
            : error.code === 'P2003'
              ? 'A linked record is invalid'
              : null;
      if (message) {
        res.status(409).json({ error: message, requestId: req.requestId });
        return;
      }
    }
    if (error instanceof multer.MulterError) {
      res.status(422).json({
        error: 'File exceeds upload limits (2 MB for attendance photos; 10 MB for other uploads)',
      });
      return;
    }
    if (config.NODE_ENV === 'test') console.error(error);
    logger.error({ err: error, requestId: req.requestId }, 'Request failed');
    res.status(500).json({ error: 'Unable to complete the request', requestId: req.requestId });
  },
);
