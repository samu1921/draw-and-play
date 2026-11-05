import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appSettings, assets, type Branding, type CertificateTemplate } from '../db/schema.js';
import { badRequest, notFound, parse } from '../errors.js';
import { brandingSchema, certificateTemplateSchema } from '../schemas.js';
import {
  ASSET_KINDS,
  BRANDING_IMAGE_KINDS,
  brandingImageIds,
  CERTIFICATE_IMAGE_KINDS,
  checkBrandingImages,
  checkCertificateImages,
  MAX_ASSET_BYTES,
  pruneAssets,
  sniffImage,
} from '../services/assets.js';
import { requireAdmin } from './auth.js';
import type { RouteDeps } from './deps.js';
import { findEvent } from './events.js';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const uploadQuery = z.object({ kind: z.enum(ASSET_KINDS), eventId: z.uuid().optional() });

async function loadSetting<T>(db: RouteDeps['db'], key: string): Promise<T | undefined> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return row?.value as T | undefined;
}

async function saveSetting(db: RouteDeps['db'], key: string, value: unknown) {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

/** The installation's look; an empty object until an admin saves one */
export const loadBranding = async (db: RouteDeps['db']) => (await loadSetting<Branding>(db, 'branding')) ?? {};
/** The installation's certificate template; empty = the built-in texts */
export const loadCertificate = async (db: RouteDeps['db']) => (await loadSetting<CertificateTemplate>(db, 'certificate')) ?? {};

export async function brandingRoutes(app: FastifyInstance, { db, legal }: RouteDeps) {
  // Raw image uploads; the type is checked again from the bytes
  app.addContentTypeParser(IMAGE_TYPES, { parseAs: 'buffer', bodyLimit: MAX_ASSET_BYTES }, (_request, body, done) => done(null, body));

  /** Installation-wide settings the frontend needs before it knows an event */
  app.get('/api/config', async () => ({ legal, branding: await loadBranding(db), certificate: await loadCertificate(db) }));

  app.put('/api/branding', { preHandler: requireAdmin }, async (request) => {
    const branding = parse(brandingSchema, request.body);
    await checkBrandingImages(db, branding, null);
    await saveSetting(db, 'branding', branding);
    await pruneAssets(db, null, BRANDING_IMAGE_KINDS, brandingImageIds(branding));
    return { branding };
  });

  app.put('/api/certificate', { preHandler: requireAdmin }, async (request) => {
    const certificate = parse(certificateTemplateSchema, request.body);
    await checkCertificateImages(db, certificate, null);
    await saveSetting(db, 'certificate', certificate);
    await pruneAssets(db, null, CERTIFICATE_IMAGE_KINDS, [certificate.backgroundId]);
    return { certificate };
  });

  app.post('/api/assets', { preHandler: requireAdmin, bodyLimit: MAX_ASSET_BYTES }, async (request, reply) => {
    const { kind, eventId } = parse(uploadQuery, request.query);
    if (eventId) await findEvent(db, eventId);
    const data = request.body;
    if (!Buffer.isBuffer(data) || data.length === 0) throw badRequest('notAnImage');
    const mime = sniffImage(data);
    if (!mime) throw badRequest('notAnImage');
    const [row] = await db
      .insert(assets)
      .values({ kind, eventId: eventId ?? null, mime, data, size: data.length })
      .returning({ id: assets.id });
    return reply.code(201).send({ id: row!.id });
  });

  // Images are public (logos and backgrounds appear on public pages). An id never changes its content.
  app.get('/api/assets/:assetId', async (request, reply) => {
    const id = z.uuid().safeParse((request.params as { assetId: string }).assetId);
    if (!id.success) throw notFound('asset');
    const [row] = await db.select({ mime: assets.mime, data: assets.data }).from(assets).where(eq(assets.id, id.data)).limit(1);
    if (!row) throw notFound('asset');
    return reply
      .header('Content-Type', row.mime)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('X-Content-Type-Options', 'nosniff')
      .send(row.data);
  });

}
