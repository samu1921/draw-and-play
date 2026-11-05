import { z } from 'zod';

// Validation schemas shared by several routes (and the event import), kept free of route imports.

/** Stages of a competition: groups, knockout or both */
export const formatSchema = z
  .object({
    groups: z.object({ groupCount: z.int().min(1).max(64), double: z.boolean().optional() }).optional(),
    knockout: z
      .object({
        qualifiersPerGroup: z.int().min(1).max(16).optional(),
        placements: z.enum(['none', 'thirdPlace', 'all']),
      })
      .optional(),
  })
  .refine((f) => f.groups !== undefined || f.knockout !== undefined, { message: 'noStages' })
  .refine((f) => !(f.groups && f.knockout) || f.knockout.qualifiersPerGroup !== undefined, { message: 'missingQualifiers' });

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
  })
  .partial();

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
});
