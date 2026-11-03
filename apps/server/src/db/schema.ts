import type { CompetitionFormat, Draw, MatchResult, MatchRules } from '@draw-and-play/domain';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigserial,
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

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// --- Access ---

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
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

export interface EventSettings {
  /** Show ratings (QTTR) in public views */
  publicRatings?: boolean;
  /** Public views show "Max M." instead of the full name */
  shortNames?: boolean;
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
    lastName: text('last_name').notNull(),
    club: text('club'),
    gender: text('gender').$type<'f' | 'm' | 'd'>(),
    birthYear: integer('birth_year'),
    licenceNo: text('licence_no'),
    rating: integer('rating'),
    createdAt: createdAt(),
  },
  (t) => [index('persons_event_idx').on(t.eventId)],
);

// --- Competitions ---

export const competitions = pgTable(
  'competitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').$type<'singles' | 'doubles'>().notNull().default('singles'),
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
