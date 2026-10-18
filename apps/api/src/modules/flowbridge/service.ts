import QRCode from 'qrcode';
import express, { Router } from 'express';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '../../lib/db';
import { assert } from '../../lib/errors';
import type { Principal } from '../auth/policy';

const settings = () => ({
  secret: process.env.META_APP_SECRET,
  verify: process.env.META_VERIFY_TOKEN,
  token: process.env.META_ACCESS_TOKEN,
  phone: process.env.META_PHONE_NUMBER_ID,
  flow: process.env.WHATSAPP_FLOW_ID,
  version: process.env.META_GRAPH_API_VERSION || 'v23.0',
  organizationId: process.env.FLOWBRIDGE_ORGANIZATION_ID,
  unitId: process.env.FLOWBRIDGE_BUSINESS_UNIT_ID,
});
export function validSignature(
  body: Buffer,
  signature: string | undefined,
  secret: string | undefined,
) {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(
    createHmac('sha256', secret).update(body).digest(),
    Buffer.from(signature.slice(7), 'hex'),
  );
}
export const greeting = (text: string) =>
  /^(hi|hello|hey|start|register|registration|form|enquiry|inquiry)[!?. ]*$/i.test(text.trim());
const messageSchema = z.object({
  id: z.string().min(1).max(250),
  from: z.string().regex(/^\d{6,16}$/),
  type: z.string().max(50),
  text: z.object({ body: z.string().max(4000) }).optional(),
  interactive: z
    .object({ nfm_reply: z.object({ response_json: z.string().max(16000) }).optional() })
    .optional(),
});
const submissionSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  mobile_number: z.string().max(25).optional(),
  city: z.string().max(100).optional(),
  service: z.string().max(100).optional(),
  contact_method: z.string().max(40).optional(),
  appointment_date: z.string().max(30).optional(),
  comments: z.string().max(1000).optional(),
});
const eventSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z.object({
                metadata: z.object({ phone_number_id: z.string() }).optional(),
                messages: z.array(messageSchema).max(100).optional(),
                statuses: z
                  .array(
                    z.object({
                      id: z.string(),
                      status: z.string(),
                      timestamp: z.string().optional(),
                    }),
                  )
                  .max(100)
                  .optional(),
              }),
            }),
          )
          .max(100),
      }),
    )
    .max(100),
});
export const webhookRouter = Router();
webhookRouter.get('/', (req, res) => {
  const c = settings();
  assert(
    c.verify && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === c.verify,
    403,
    'Webhook verification failed',
  );
  res.type('text/plain').send(String(req.query['hub.challenge'] || ''));
});
webhookRouter.post(
  '/',
  express.raw({ type: 'application/json', limit: '256kb' }),
  async (req, res) => {
    const c = settings();
    assert(
      Buffer.isBuffer(req.body) &&
        validSignature(req.body, req.get('x-hub-signature-256'), c.secret),
      403,
      'Invalid webhook signature',
    );
    assert(
      c.organizationId && c.phone && c.unitId,
      503,
      'FlowBridge organization is not configured',
    );
    let raw: unknown;
    try {
      raw = JSON.parse(req.body.toString());
    } catch {
      res.status(400).json({ error: 'Malformed webhook' });
      return;
    }
    const payload = eventSchema.parse(raw);
    const unit = await db.businessUnit.findFirst({
      where: { id: c.unitId, organizationId: c.organizationId, deletedAt: null },
    });
    assert(unit, 503, 'FlowBridge business unit is unavailable');
    let queued = 0;
    for (const entry of payload.entry)
      for (const change of entry.changes) {
        const v = change.value;
        if (v.metadata?.phone_number_id !== c.phone) continue;
        for (const m of v.messages || []) {
          const result = await db.flowEvent.createMany({
            skipDuplicates: true,
            data: [
              {
                organizationId: c.organizationId,
                eventKey: `in:${c.organizationId}:${m.id}`,
                payload: { kind: 'IN', message: m } as Prisma.InputJsonValue,
              },
            ],
          });
          queued += result.count;
        }
        for (const s of v.statuses || []) {
          const key = createHash('sha256')
            .update(`${s.id}:${s.status}:${s.timestamp || ''}`)
            .digest('hex');
          await db.flowEvent.createMany({
            skipDuplicates: true,
            data: [
              {
                organizationId: c.organizationId,
                eventKey: `status:${c.organizationId}:${key}`,
                payload: { kind: 'STATUS', ...s },
              },
            ],
          });
        }
      }
    res.json({ received: true, queued });
  },
);
function owner(p: Principal) {
  assert(
    p.role === 'Super Admin' && p.scope === 'ORGANIZATION',
    403,
    'Super administrator access required',
  );
}
export const flowRouter = Router();
flowRouter.use((req, _res, next) => {
  owner(req.principal);
  next();
});
flowRouter.get('/', async (req, res) => {
  const organizationId = req.principal.organizationId;
  const [contacts, campaigns, failed, pending] = await Promise.all([
    db.flowContact.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
    db.flowCampaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.flowEvent.count({ where: { organizationId, status: 'FAILED' } }),
    db.flowEvent.count({ where: { organizationId, status: { in: ['PENDING', 'PROCESSING'] } } }),
  ]);
  const c = settings();
  res.json({
    contacts,
    campaigns: campaigns.map((x) => ({
      ...x,
      url: `https://wa.me/${x.phone}?text=${encodeURIComponent(x.message)}`,
    })),
    failed,
    pending,
    configured: !!(
      c.secret &&
      c.verify &&
      c.token &&
      c.phone &&
      c.flow &&
      c.unitId &&
      c.organizationId === organizationId
    ),
    webhookPath: '/api/flowbridge/webhook',
    flowId: c.flow || null,
  });
});
flowRouter.get('/contacts/:id/messages', async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const contact = await db.flowContact.findFirst({
    where: { id, organizationId: req.principal.organizationId },
  });
  assert(contact, 404, 'Contact not found');
  res.json(
    await db.flowMessage.findMany({
      where: { contactId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  );
});
flowRouter.patch('/contacts/:id', async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const b = z
    .strictObject({
      status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED']),
      notes: z.string().trim().max(2000).optional(),
    })
    .parse(req.body);
  await db.$transaction(async (tx) => {
    const contact = await tx.flowContact.findFirst({
      where: { id, organizationId: req.principal.organizationId },
    });
    assert(contact, 404, 'Contact not found');
    await tx.flowContact.update({ where: { id }, data: b });
    if (contact.leadId)
      await tx.lead.updateMany({
        where: { id: contact.leadId, organizationId: req.principal.organizationId },
        data: { status: b.status, notes: b.notes },
      });
    await tx.auditLog.create({
      data: {
        organizationId: req.principal.organizationId,
        actorId: req.principal.userId,
        action: 'FLOW_CONTACT_UPDATED',
        entity: 'flow_contact',
        entityId: id,
        newValue: b,
        requestId: req.requestId,
      },
    });
  });
  res.json({ ok: true });
});
flowRouter.post('/campaigns', async (req, res) => {
  const b = z
    .strictObject({
      name: z.string().trim().min(1).max(100),
      phone: z.string().regex(/^\d{8,15}$/),
      message: z.string().trim().min(1).max(200).default('Hi'),
    })
    .parse(req.body);
  res.status(201).json(
    await db.flowCampaign.create({
      data: { organizationId: req.principal.organizationId, ...b },
    }),
  );
});
flowRouter.get('/campaigns/:id/qr', async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const campaign = await db.flowCampaign.findFirst({
    where: { id, organizationId: req.principal.organizationId },
  });
  assert(campaign, 404, 'Campaign not found');
  const url = `https://wa.me/${campaign.phone}?text=${encodeURIComponent(campaign.message)}`;
  res
    .attachment('whatsapp-campaign.png')
    .type('png')
    .send(await QRCode.toBuffer(url, { width: 420, margin: 2 }));
});
flowRouter.post('/retry', async (req, res) => {
  const result = await db.flowEvent.updateMany({
    where: { organizationId: req.principal.organizationId, status: 'FAILED' },
    data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lastError: null },
  });
  res.json({ retried: result.count });
});
async function processIncoming(event: {
  id: string;
  organizationId: string;
  payload: Prisma.JsonValue;
}) {
  const payload = event.payload as Record<string, any>;
  const c = settings();
  if (payload.kind === 'STATUS') {
    await db.flowMessage.updateMany({
      where: { metaId: payload.id, contact: { organizationId: event.organizationId } },
      data: { deliveryStatus: payload.status },
    });
    return;
  }
  if (payload.kind === 'OUT') {
    assert(
      c.token && c.phone && /^v\d+\.\d+$/.test(c.version),
      503,
      'Meta messaging is not configured',
    );
    const response = await fetch(`https://graph.facebook.com/${c.version}/${c.phone}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: payload.to, ...payload.message }),
      signal: AbortSignal.timeout(12000),
    });
    const result: any = await response.json();
    // Meta does not provide an idempotency key: ambiguous network failures can duplicate an outbound reply.
    assert(response.ok, 502, `Meta message request failed (${response.status})`);
    await db.flowMessage.create({
      data: {
        contactId: payload.contactId,
        metaId: result.messages?.[0]?.id,
        direction: 'OUT',
        kind: payload.message.type,
        content:
          payload.message.type === 'interactive'
            ? 'Registration Flow sent'
            : payload.message.text.body,
      },
    });
    return;
  }
  const m = messageSchema.parse(payload.message);
  const json = m.interactive?.nfm_reply?.response_json;
  const form = json ? submissionSchema.parse(JSON.parse(json)) : null;
  await db.$transaction(async (tx) => {
    if (await tx.flowMessage.findUnique({ where: { metaId: m.id } })) return;
    const contact = await tx.flowContact.upsert({
      where: {
        organizationId_whatsappId: { organizationId: event.organizationId, whatsappId: m.from },
      },
      create: { organizationId: event.organizationId, whatsappId: m.from },
      update: { updatedAt: new Date() },
    });
    await tx.flowMessage.create({
      data: {
        contactId: contact.id,
        metaId: m.id,
        direction: 'IN',
        kind: m.type,
        content: form ? JSON.stringify(form) : m.text?.body || `[${m.type}]`,
      },
    });
    if (form) {
      assert(
        c.unitId && c.organizationId === event.organizationId,
        503,
        'FlowBridge business unit is not configured',
      );
      const unit = await tx.businessUnit.findFirst({
        where: { id: c.unitId, organizationId: event.organizationId, deletedAt: null },
      });
      assert(unit, 503, 'Business unit unavailable');
      const data = {
        name: form.full_name,
        company: form.full_name,
        contact: `${m.from} / ${form.email}`,
        requirement: [form.service, form.comments].filter(Boolean).join(': '),
        source: 'WHATSAPP',
        businessUnitId: unit.id,
      };
      const lead = contact.leadId
        ? await tx.lead.update({
            where: { id: contact.leadId, organizationId: event.organizationId },
            data,
          })
        : await tx.lead.create({ data: { organizationId: event.organizationId, ...data } });
      await tx.flowContact.update({
        where: { id: contact.id },
        data: {
          name: form.full_name,
          email: form.email,
          city: form.city,
          state: 'COMPLETED',
          submission: form,
          leadId: lead.id,
        },
      });
    } else if (greeting(m.text?.body || '')) {
      assert(c.flow, 503, 'WhatsApp Flow is not configured');
      const message = {
        type: 'interactive',
        interactive: {
          type: 'flow',
          body: { text: 'Welcome! Please complete our registration form.' },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_id: c.flow,
              flow_cta: 'Open form',
              flow_action: 'navigate',
              flow_action_payload: { screen: 'REGISTRATION', data: {} },
            },
          },
        },
      };
      await tx.flowEvent.create({
        data: {
          organizationId: event.organizationId,
          eventKey: `out:${event.id}`,
          payload: { kind: 'OUT', to: m.from, contactId: contact.id, message },
        },
      });
      await tx.flowContact.update({ where: { id: contact.id }, data: { state: 'FORM_QUEUED' } });
    }
  });
}
let running = false;
export async function runFlowJobs() {
  if (running) return;
  running = true;
  try {
    await db.flowEvent.updateMany({
      where: { status: 'PROCESSING', lockedAt: { lt: new Date(Date.now() - 300000) } },
      data: { status: 'PENDING', lockedAt: null },
    });
    const jobs = await db.flowEvent.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
      take: 10,
      orderBy: { createdAt: 'asc' },
    });
    for (const job of jobs) {
      const lock = await db.flowEvent.updateMany({
        where: { id: job.id, status: 'PENDING' },
        data: { status: 'PROCESSING', lockedAt: new Date(), attempts: { increment: 1 } },
      });
      if (!lock.count) continue;
      try {
        await processIncoming(job);
        await db.flowEvent.update({
          where: { id: job.id },
          data: { status: 'DONE', lockedAt: null },
        });
      } catch {
        await db.flowEvent.update({
          where: { id: job.id },
          data: {
            status: job.attempts >= 4 ? 'FAILED' : 'PENDING',
            lastError: 'Processing failed; check configuration or message format',
            nextAttemptAt: new Date(Date.now() + Math.min(60000, 1000 * 2 ** (job.attempts + 1))),
            lockedAt: null,
          },
        });
      }
    }
  } finally {
    running = false;
  }
}
