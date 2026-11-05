import { and, eq, inArray, isNull, lt, notInArray } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { assets, type AssetKind, type Branding } from '../db/schema.js';
import { badRequest } from '../errors.js';

export const ASSET_KINDS = ['logo', 'displayBackground', 'certificateBackground'] as const satisfies readonly AssetKind[];

/** Largest accepted image: enough for a 16:9 photo in good quality */
export const MAX_ASSET_BYTES = 8 * 1024 * 1024;

/**
 * The image type from the file's first bytes. The declared content type is not trusted: only PNG, JPEG and WebP
 * are accepted, never SVG (it can carry script).
 */
export function sniffImage(data: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 12 && data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/** Which branding field holds which kind of image */
const BRANDING_IMAGES = { logoId: 'logo', displayBackgroundId: 'displayBackground' } as const;

/** Every image a branding refers to must exist, be of the right kind and belong to the same scope */
export async function checkBrandingImages(ex: Executor, branding: Branding, eventId: string | null) {
  for (const [field, kind] of Object.entries(BRANDING_IMAGES) as [keyof typeof BRANDING_IMAGES, AssetKind][]) {
    const id = branding[field];
    if (!id) continue;
    const [row] = await ex
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.id, id), eq(assets.kind, kind), eventId ? eq(assets.eventId, eventId) : isNull(assets.eventId)))
      .limit(1);
    if (!row) throw badRequest('unknownImage', { field });
  }
}

/**
 * Deletes images of a scope (installation or event) that nothing refers to any more. Fresh uploads are kept for a
 * while, since the form that uploaded them may not have been saved yet.
 */
export async function pruneAssets(ex: Executor, eventId: string | null, kinds: readonly AssetKind[], keep: readonly (string | null | undefined)[]) {
  const ids = keep.filter((id): id is string => !!id);
  const cutoff = new Date(Date.now() - 30 * 60_000);
  await ex
    .delete(assets)
    .where(
      and(
        eventId ? eq(assets.eventId, eventId) : isNull(assets.eventId),
        inArray(assets.kind, [...kinds]),
        lt(assets.createdAt, cutoff),
        ids.length > 0 ? notInArray(assets.id, ids) : undefined,
      ),
    );
}

/** Images a branding refers to, for pruning */
export const brandingImageIds = (b: Branding | undefined) => [b?.logoId, b?.displayBackgroundId];
export const BRANDING_IMAGE_KINDS: readonly AssetKind[] = ['logo', 'displayBackground'];
