import { z } from 'zod';

// Validation schemas shared by several routes (and the event import), kept free of route imports.

/** Stages of a competition: groups or a Swiss system, a knockout, or both in a row; or rotating partners alone */
export const formatSchema = z
  .object({
    groups: z.object({ groupCount: z.int().min(1).max(64), double: z.boolean().optional() }).optional(),
    swiss: z.object({ rounds: z.int().min(1).max(64) }).optional(),
    rotation: z.object({}).strict().optional(),
    knockout: z
      .object({
        qualifiersPerGroup: z.int().min(1).max(16).optional(),
        placements: z.enum(['none', 'thirdPlace', 'all']),
        fillByes: z.boolean().optional(),
        consolation: z.enum(['bracket', 'perRank']).optional(),
      })
      .optional(),
  })
  .refine((f) => f.groups !== undefined || f.swiss !== undefined || f.knockout !== undefined || f.rotation !== undefined, { message: 'noStages' })
  .refine((f) => !(f.groups && f.swiss), { message: 'conflictingStages' })
  .refine((f) => !(f.rotation && (f.groups || f.swiss || f.knockout)), { message: 'conflictingStages' })
  .refine((f) => !((f.groups || f.swiss) && f.knockout) || f.knockout.qualifiersPerGroup !== undefined, { message: 'missingQualifiers' });

/** Kinds of competition; `rotation` = doubles with rotating partners, entered as single players */
export const competitionKindSchema = z.enum(['singles', 'doubles', 'rotation']);

/** Doubles with rotating partners use their own format and no other; the other kinds cannot use it */
export const fitsKind = (kind: z.infer<typeof competitionKindSchema>, format: { rotation?: object | undefined }) =>
  (kind === 'rotation') === (format.rotation !== undefined);

/** Settings of a display profile; every field is optional and falls back to `displayDefaults` */
export const displaySettingsSchema = z
  .object({
    slideSeconds: z.int().min(5).max(600),
    tables: z.boolean(),
    next: z.boolean(),
    entries: z.boolean(),
    competitionIds: z.array(z.uuid()).max(64).nullable(),
    todayOnly: z.boolean(),
    liveDraw: z.boolean(),
    rules: z.boolean(),
  })
  .partial();

/** Look of the installation or an event (see `Branding`); empty strings clear a field */
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
export const brandingSchema = z
  .object({
    name: z.preprocess(blankToNull, z.string().trim().max(60).nullable()),
    accent: z.preprocess(blankToNull, z.string().regex(/^#[0-9a-fA-F]{6}$/).transform((v) => v.toLowerCase()).nullable()),
    logoId: z.uuid().nullable(),
    displayBackgroundId: z.uuid().nullable(),
    displayDim: z.int().min(0).max(90).nullable(),
  })
  .partial();

/** Certificate template (see `CertificateTemplate`) */
const certificateLine = z.string().max(200);
export const certificateTemplateSchema = z.object({
  mode: z.enum(['designed', 'textOnly']).optional(),
  showLogo: z.boolean().optional(),
  backgroundId: z.uuid().nullable().optional(),
  lines: z
    .object({ top: certificateLine, title: certificateLine, name: certificateLine, sub: certificateLine, place: certificateLine, text: certificateLine, bottom: certificateLine })
    .partial()
    .optional(),
  signatures: z.array(z.string().trim().max(60)).max(2).optional(),
});

/** Event-wide settings (see `EventSettings`) */
const httpUrl = z
  .url({ protocol: /^https?$/ })
  .max(500)
  .nullable()
  .optional();

export const eventSettingsSchema = z.object({
  publicRatings: z.boolean().optional(),
  shortNames: z.boolean().optional(),
  // An empty field in the form clears the link (back to the installation's default)
  imprintUrl: z.preprocess((v) => (v === '' ? null : v), httpUrl),
  privacyUrl: z.preprocess((v) => (v === '' ? null : v), httpUrl),
  privacyNote: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(1000).nullable().optional()),
  branding: brandingSchema.optional(),
  certificate: certificateTemplateSchema.nullable().optional(),
});
