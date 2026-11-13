import type { CompetitionFormat, Draw, MatchResult, MatchRules } from '@draw-and-play/domain';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigserial,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Binary data (images); node-postgres returns a Buffer */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// --- Access ---

export type UserRole = 'admin' | 'desk';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  /** admin: everything; desk (registration desk): players, entries and attendance only */
  role: text('role').$type<UserRole>().notNull().default('admin'),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the session token; the token itself only lives in the cookie */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

// --- Event ---

/**
 * Look of the installation, or of one event on top of it (fields left out or null fall back to the installation).
 * Image ids point to `assets`.
 */
export interface Branding {
  /** Shown top left and in the browser tab instead of "Draw & Play", e.g. the club */
  name?: string | null;
  /** Accent colour as #rrggbb; the app derives readable variants for light and dark */
  accent?: string | null;
  logoId?: string | null;
  /** 16:9 picture behind the projector displays */
  displayBackgroundId?: string | null;
  /** How much the display background is darkened, in percent, so text stays readable */
  displayDim?: number | null;
}

/** Texts of a certificate; placeholders such as {name} or {platz} are filled in when printing */
export interface CertificateLines {
  top?: string;
  title?: string;
  name?: string;
  sub?: string;
  place?: string;
  text?: string;
  bottom?: string;
}

/** Certificate template of the installation, or an event's own instead of it */
export interface CertificateTemplate {
  /** "textOnly": only the texts, for pre-printed paper (no frame, logo or background) */
  mode?: 'designed' | 'textOnly';
  showLogo?: boolean;
  /** Image of kind certificateBackground, A4 landscape */
  backgroundId?: string | null;
  lines?: CertificateLines;
  /** Captions under signature lines; empty = no line */
  signatures?: string[];
}

export interface EventSettings {
  /** Show ratings (QTTR) in public views */
  publicRatings?: boolean;
  /** Public views show "Max M." instead of the full name */
  shortNames?: boolean;
  /** Legal notice (Impressum) of this event; empty = the installation's default */
  imprintUrl?: string | null;
  /** Privacy policy of this event; empty = the installation's default */
  privacyUrl?: string | null;
  /** Short note on the public pages, e.g. that names and results are published */
  privacyNote?: string | null;
  /** The event's own look on top of the installation's */
  branding?: Branding;
  /** The event's own certificate template instead of the installation's; null/absent = the installation's */
  certificate?: CertificateTemplate | null;
}

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  startsOn: date('starts_on'),
  endsOn: date('ends_on'),
  timezone: text('timezone').notNull().default('Europe/Berlin'),
  sport: text('sport').notNull().default('table-tennis'),
  settings: jsonb('settings').$type<EventSettings>().notNull().default({}),
  /** Argon2 hash of the result-entry PIN; null = result entry by PIN is off */
  pinHash: text('pin_hash'),
  /** Bumped on every new PIN, which signs out all devices */
  pinVersion: integer('pin_version').notNull().default(0),
  /**
   * Code that opens the public views (plain text, so the notice with its QR code can be printed again at any time;
   * it only grants reading). null = the public views are open to everybody.
   */
  viewerCode: text('viewer_code'),
  /** Bumped on every new viewer code, which signs out all viewers */
  viewerCodeVersion: integer('viewer_code_version').notNull().default(0),
  createdAt: createdAt(),
});

/** A phone or tablet that entered the event's PIN and may enter results of called matches */
export const deviceSessions = pgTable(
  'device_sessions',
  {
    /** SHA-256 of the device token */
    id: text('id').primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    pinVersion: integer('pin_version').notNull(),
    label: text('label'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('device_sessions_event_idx').on(t.eventId)],
);

/** A browser that entered the viewer code of an event and may read its public views */
export const viewerSessions = pgTable(
  'viewer_sessions',
  {
    /** SHA-256 of the viewer token */
    id: text('id').primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    codeVersion: integer('code_version').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('viewer_sessions_event_idx').on(t.eventId)],
);

export const eventTables = pgTable(
  'event_tables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('event_tables_name_idx').on(t.eventId, t.name)],
);

export const persons = pgTable(
  'persons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    firstName: text('first_name').notNull(),
    /** Optional: a first name alone is enough (guests, children) */
    lastName: text('last_name'),
    club: text('club'),
    gender: text('gender').$type<'f' | 'm' | 'd'>(),
    birthYear: integer('birth_year'),
    licenceNo: text('licence_no'),
    rating: integer('rating'),
    createdAt: createdAt(),
  },
  (t) => [index('persons_event_idx').on(t.eventId)],
);

/** Settings of a display profile (projector, TV); every field has a default, see `displayDefaults` */
export interface DisplaySettings {
  /** Seconds per slide */
  slideSeconds: number;
  /** Table overview */
  tables: boolean;
  /** Matches that are ready to be called */
  next: boolean;
  /** Where the drawn competitions stand: tables, rounds, brackets, consolation fields, placements */
  standings: boolean;
  /** Entry lists of competitions that are not drawn yet */
  entries: boolean;
  /** Competitions to show; null = all */
  competitionIds: string[] | null;
  /** Only competitions of the current day (competitions without a day always count) */
  todayOnly: boolean;
  /** Jump to a competition when it is drawn and reveal the draw step by step */
  liveDraw: boolean;
  /** Slides with the format of each competition and how ties in finished groups were broken */
  rules: boolean;
}

/** A named display configuration. Every admin can build their own; each screen opens one profile by its link. */
export const displayProfiles = pgTable(
  'display_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Who created the profile; kept when the user goes */
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    settings: jsonb('settings').$type<Partial<DisplaySettings>>().notNull().default({}),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [index('display_profiles_event_idx').on(t.eventId)],
);

// --- Competitions ---

export type CompetitionKind = 'singles' | 'doubles' | 'rotation';

export const competitions = pgTable(
  'competitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** rotation: doubles with rotating partners; the entries are single players, every match is two against two */
    kind: text('kind').$type<CompetitionKind>().notNull().default('singles'),
    day: date('day'),
    matchRules: jsonb('match_rules').$type<MatchRules>().notNull(),
    matchMinutes: integer('match_minutes').notNull(),
    format: jsonb('format').$type<CompetitionFormat>().notNull(),
    /** Minutes since midnight */
    earliestStart: integer('earliest_start'),
    startAfterId: uuid('start_after_id').references((): AnyPgColumn => competitions.id, { onDelete: 'set null' }),
    /** Allowed tables; null = all tables of the event */
    tableIds: jsonb('table_ids').$type<string[]>(),
    color: integer('color').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Set once drawn; the match structure is derived from format + draw */
    draw: jsonb('draw').$type<Draw>(),
    drawSeed: text('draw_seed'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [index('competitions_event_idx').on(t.eventId)],
);

export const entries = pgTable(
  'entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitionId: uuid('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    /** Manual seed (1 = strongest) */
    seed: integer('seed'),
    status: text('status').$type<'registered' | 'present' | 'withdrawn'>().notNull().default('registered'),
    createdAt: createdAt(),
  },
  (t) => [index('entries_competition_idx').on(t.competitionId)],
);

export const entryMembers = pgTable(
  'entry_members',
  {
    entryId: uuid('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    // Cascade, so deleting a whole event (persons and entries alike) works. Deleting a single person who is
    // entered somewhere is refused by the API instead (a restrict constraint would also block the event delete).
    personId: uuid('person_id')
      .notNull()
      .references(() => persons.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.position] }), index('entry_members_person_idx').on(t.personId)],
);

// --- Matches (operational state; who plays is derived from the draw and earlier results) ---

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitionId: uuid('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    /** Id of the match in the competition structure, e.g. "GA-1-1" or "KO-r2p1m1" */
    matchKey: text('match_key').notNull(),
    status: text('status').$type<'scheduled' | 'called' | 'finished'>().notNull().default('scheduled'),
    tableId: uuid('table_id').references(() => eventTables.id, { onDelete: 'set null' }),
    calledAt: timestamp('called_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    result: jsonb('result').$type<MatchResult>(),
    /** Entries at the time of calling/finishing, so a result stays bound to who actually played */
    sideA: uuid('side_a').references(() => entries.id, { onDelete: 'set null' }),
    sideB: uuid('side_b').references(() => entries.id, { onDelete: 'set null' }),
    /** Rotating partners: the partner of the player on each side */
    partnerA: uuid('partner_a').references(() => entries.id, { onDelete: 'set null' }),
    partnerB: uuid('partner_b').references(() => entries.id, { onDelete: 'set null' }),
    /** Optimistic locking: commands must name the version they saw */
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('matches_key_idx').on(t.competitionId, t.matchKey),
    // A table holds at most one called match: enforced by the database, not only by the API.
    uniqueIndex('matches_called_table_idx').on(t.tableId).where(sql`${t.status} = 'called'`),
  ],
);

// --- Audit ---

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
    /** "user:<id>" or "device:<id>" */
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    data: jsonb('data'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_event_idx').on(t.eventId, t.createdAt)],
);

// --- Installation ---

/** Settings of the whole installation, one row per key (e.g. "branding") */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AssetKind = 'logo' | 'displayBackground' | 'certificateBackground';

/** Uploaded images (logos, backgrounds). event_id null = belongs to the installation. Kept in the database so backups include them. */
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<AssetKind>().notNull(),
    mime: text('mime').notNull(),
    data: bytea('data').notNull(),
    size: integer('size').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('assets_event_idx').on(t.eventId)],
);
