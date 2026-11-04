import { tableTennis, type CompetitionFormat } from '@draw-and-play/domain';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../auth/password.js';
import type { Db } from '../db/client.js';
import { competitions, displayProfiles, entries, entryMembers, eventTables, events, persons } from '../db/schema.js';

/**
 * Demo data: the club championship from the concept (chapter 2) with made-up players, ready to be drawn.
 * Friday: three youth competitions. Saturday: doubles, then singles, hobby from 13:00. All names are fictional.
 */
export const DEMO_SLUG = 'vm-demo';
/** Fixed PIN so phones can be tried right away. Demo only: real events get a random one. */
export const DEMO_PIN = '123456';

const CLUB = 'TTC Musterstadt';

type PersonSeed = [firstName: string, lastName: string, rating: number | null, birthYear: number | null];

const youthU19: PersonSeed[] = [
  ['Lena', 'Hofmann', 1380, 2008],
  ['Paul', 'Wagner', 1340, 2009],
  ['Mia', 'Schäfer', 1290, 2008],
  ['Noah', 'Becker', 1250, 2010],
  ['Lea', 'Koch', 1190, 2009],
];
const youthU14: PersonSeed[] = [
  ['Finn', 'Richter', 1120, 2013],
  ['Emilia', 'Klein', 1080, 2014],
  ['Luis', 'Wolf', 1040, 2013],
  ['Hanna', 'Neumann', 990, 2014],
  ['Ben', 'Schwarz', 950, 2013],
];
const youthBeginners: PersonSeed[] = [
  ['Ella', 'Zimmermann', null, 2015],
  ['Leon', 'Braun', null, 2014],
  ['Sophie', 'Krüger', null, 2016],
  ['Elias', 'Hartmann', null, 2015],
  ['Marie', 'Lange', null, 2016],
];
/** The singles players; most of them also play doubles */
const actives: PersonSeed[] = [
  ['Tobias', 'Schmitt', 1745, 1988],
  ['Julia', 'Werner', 1712, 1994],
  ['Markus', 'Krause', 1688, 1979],
  ['Sarah', 'Meier', 1650, 1991],
  ['Daniel', 'Lehmann', 1631, 1985],
  ['Kathrin', 'Schulze', 1597, 1983],
  ['Stefan', 'Maier', 1574, 1976],
  ['Anja', 'Köhler', 1540, 1990],
  ['Florian', 'Herrmann', 1512, 1996],
  ['Nina', 'König', 1478, 1998],
  ['Michael', 'Walter', 1445, 1972],
  ['Laura', 'Mayer', 1401, 2001],
];
/** Doubles partners who do not play singles */
const doublesOnly: PersonSeed[] = [
  ['Thomas', 'Huber', 1380, 1968],
  ['Sabine', 'Kaiser', 1355, 1974],
  ['Andreas', 'Fuchs', 1320, 1970],
  ['Petra', 'Peters', 1290, 1977],
];
const hobby: PersonSeed[] = [
  ['Uwe', 'Lang', null, 1965],
  ['Monika', 'Scholz', null, 1969],
  ['Jürgen', 'Möller', null, 1961],
  ['Birgit', 'Weiß', null, 1972],
  ['Ralf', 'Jung', null, 1967],
];

const roundRobin: CompetitionFormat = { groups: { groupCount: 1 } };

/** The coming Friday and Saturday (this weekend if it is Friday or Saturday today), as YYYY-MM-DD */
export function demoWeekend(today = new Date()): { friday: string; saturday: string } {
  const day = today.getDay(); // 0 = Sunday … 5 = Friday, 6 = Saturday
  const toFriday = day === 6 ? -1 : (5 - day + 7) % 7;
  const friday = new Date(today);
  friday.setDate(today.getDate() + toFriday);
  const saturday = new Date(friday);
  saturday.setDate(friday.getDate() + 1);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { friday: iso(friday), saturday: iso(saturday) };
}

/** Creates the demo event unless it exists. Returns whether anything was created. */
export async function seedDemo(db: Db, today = new Date()): Promise<boolean> {
  const [existing] = await db.select({ id: events.id }).from(events).where(eq(events.slug, DEMO_SLUG)).limit(1);
  if (existing) return false;
  const { friday, saturday } = demoWeekend(today);
  const pinHash = await hashPassword(DEMO_PIN);

  await db.transaction(async (tx) => {
    const [event] = await tx
      .insert(events)
      .values({ slug: DEMO_SLUG, name: 'Vereinsmeisterschaft 2026 (Demo)', startsOn: friday, endsOn: saturday, pinHash, pinVersion: 1 })
      .returning();
    const eventId = event!.id;
    await tx.insert(eventTables).values([1, 2, 3, 4].map((n) => ({ eventId, name: String(n), sortOrder: n - 1 })));
    await tx.insert(displayProfiles).values({ eventId, name: 'Beamer Halle' });

    const addPersons = async (seeds: PersonSeed[]) =>
      (
        await tx
          .insert(persons)
          .values(seeds.map(([firstName, lastName, rating, birthYear]) => ({ eventId, firstName, lastName, club: CLUB, rating, birthYear })))
          .returning({ id: persons.id })
      ).map((p) => p.id);
    const [u19, u14, beginners, singles, partners, hobbyists] = [
      await addPersons(youthU19),
      await addPersons(youthU14),
      await addPersons(youthBeginners),
      await addPersons(actives),
      await addPersons(doublesOnly),
      await addPersons(hobby),
    ];

    let sortOrder = 0;
    const addCompetition = async (values: {
      name: string;
      kind?: 'singles' | 'doubles';
      day: string;
      gamesToWin: number;
      format: CompetitionFormat;
      earliestStart: number;
      startAfterId?: string;
      entries: string[][];
    }) => {
      const matchRules = { ...tableTennis.defaultMatchRules, gamesToWin: values.gamesToWin };
      const [competition] = await tx
        .insert(competitions)
        .values({
          eventId,
          name: values.name,
          kind: values.kind ?? 'singles',
          day: values.day,
          matchRules,
          matchMinutes: tableTennis.estimateMatchMinutes(matchRules),
          format: values.format,
          earliestStart: values.earliestStart,
          startAfterId: values.startAfterId ?? null,
          color: sortOrder,
          sortOrder: sortOrder++,
        })
        .returning();
      for (const personIds of values.entries) {
        const [entry] = await tx.insert(entries).values({ competitionId: competition!.id, status: 'present' }).returning();
        await tx.insert(entryMembers).values(personIds.map((personId, position) => ({ entryId: entry!.id, personId, position })));
      }
      return competition!;
    };
    const one = (ids: string[]) => ids.map((id) => [id]);

    await addCompetition({ name: 'Jugend U19', day: friday, gamesToWin: 3, format: roundRobin, earliestStart: 17 * 60, entries: one(u19) });
    await addCompetition({ name: 'Jugend U14', day: friday, gamesToWin: 3, format: roundRobin, earliestStart: 17 * 60, entries: one(u14) });
    await addCompetition({ name: 'Jugend Anfänger', day: friday, gamesToWin: 3, format: roundRobin, earliestStart: 17 * 60, entries: one(beginners) });

    // Doubles: strong and weaker singles players pair up, four pairs bring a doubles-only partner.
    const pairs = [
      [singles[0]!, singles[11]!],
      [singles[1]!, singles[10]!],
      [singles[2]!, singles[9]!],
      [singles[3]!, singles[8]!],
      [singles[4]!, partners[0]!],
      [singles[5]!, partners[1]!],
      [singles[6]!, partners[2]!],
      [singles[7]!, partners[3]!],
    ];
    const doubles = await addCompetition({
      name: 'Doppel',
      kind: 'doubles',
      day: saturday,
      gamesToWin: 3,
      format: { groups: { groupCount: 2 }, knockout: { qualifiersPerGroup: 2, placements: 'thirdPlace' } },
      earliestStart: 10 * 60,
      entries: pairs,
    });
    await addCompetition({
      name: 'Einzel Aktive',
      day: saturday,
      gamesToWin: 3,
      format: { groups: { groupCount: 3 }, knockout: { qualifiersPerGroup: 2, placements: 'thirdPlace' } },
      earliestStart: 12 * 60,
      startAfterId: doubles.id,
      entries: one(singles),
    });
    await addCompetition({ name: 'Hobby', day: saturday, gamesToWin: 2, format: roundRobin, earliestStart: 13 * 60, entries: one(hobbyists) });
  });
  return true;
}
