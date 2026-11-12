import {
  rankStandings,
  tallyStandings,
  type EntryId,
  type RankingInput,
  type StandingsExplanation,
  type StandingsMatch,
  type StandingsOptions,
} from './standings.js';

/** The pairings of one Swiss round. Entries that appear nowhere had withdrawn before the round was paired. */
export interface SwissRound {
  /** In board order: the top of the table plays on board 1 */
  pairs: [EntryId, EntryId][];
  /** With an odd number of players one of them sits out and is credited a win */
  bye?: EntryId;
}

/**
 * How many rounds a Swiss system can have. At least as many as a knockout of the same size needs to find a winner,
 * ideally two more (DTTB WO D 7.6); at most every entry plays every other one.
 */
export function swissRoundRange(entryCount: number): { min: number; recommended: number; max: number } {
  const max = Math.max(1, entryCount % 2 === 0 ? entryCount - 1 : entryCount);
  const min = Math.min(max, Math.max(1, Math.ceil(Math.log2(Math.max(2, entryCount)))));
  return { min, recommended: Math.min(max, min + 2), max };
}

const pairKey = (a: EntryId, b: EntryId) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/** What one finished round contributes to the table */
export interface SwissRoundResults {
  /** Finished matches of the round, including walkovers */
  matches: readonly StandingsMatch[];
  /** Finished without a winner: both sides had withdrawn before they played, each is given a loss */
  void?: readonly (readonly [EntryId, EntryId])[];
  bye?: EntryId | undefined;
  /** Entries that had withdrawn before the round was paired: a loss without an opponent */
  absent?: readonly EntryId[];
}

/**
 * The table of a Swiss system. A bye counts as a win; an entry that has withdrawn keeps its wins and is given a
 * loss for every later round. The Buchholz score adds up the wins of the opponents so far, a bye counting with the
 * wins of the entry at the bottom of the table (DTTB WO D 7.6).
 */
export function swissStandings(
  order: readonly EntryId[],
  rounds: readonly SwissRoundResults[],
  ranking: RankingInput,
  options: StandingsOptions = {},
): StandingsExplanation {
  const matches = rounds.flatMap((r) => r.matches);
  const stats = tallyStandings(order, matches);
  const opponents = new Map<EntryId, EntryId[]>(order.map((id) => [id, []]));
  const byes = new Map<EntryId, number>();
  for (const { a, b } of matches) {
    opponents.get(a)?.push(b);
    opponents.get(b)?.push(a);
  }
  for (const round of rounds) {
    const bye = round.bye === undefined ? undefined : stats.get(round.bye);
    if (bye) {
      bye.played++;
      bye.won++;
      bye.matchPoints++;
      byes.set(bye.entryId, (byes.get(bye.entryId) ?? 0) + 1);
    }
    const lost = [...(round.absent ?? []), ...(round.void ?? []).flat()];
    for (const id of lost) {
      const s = stats.get(id);
      if (!s) continue;
      s.played++;
      s.lost++;
    }
  }

  const all = [...stats.values()];
  const fewestWins = all.length > 0 ? Math.min(...all.map((s) => s.won)) : 0;
  for (const s of all) {
    s.buchholz = opponents.get(s.entryId)!.reduce((sum, id) => sum + (stats.get(id)?.won ?? 0), 0) + (byes.get(s.entryId) ?? 0) * fewestWins;
  }
  const lowestBuchholz = all.length > 0 ? Math.min(...all.map((s) => s.buchholz!)) : 0;
  for (const s of all) {
    s.fineBuchholz =
      opponents.get(s.entryId)!.reduce((sum, id) => sum + (stats.get(id)?.buchholz ?? 0), 0) + (byes.get(s.entryId) ?? 0) * lowestBuchholz;
  }
  return rankStandings(order, matches, ranking, stats, options);
}

export interface SwissPairingInput {
  /** Entries still playing, best first: by wins, then as the table (or before round 1 the draw) orders them */
  ranked: readonly EntryId[];
  wins: ReadonlyMap<EntryId, number>;
  /** Rounds played so far: nobody meets the same opponent twice, and a bye goes to someone who has not had one */
  previous: readonly SwissRound[];
  /** Wins without playing so far (byes and walkovers), so that these are spread as evenly as possible */
  freeWins?: ReadonlyMap<EntryId, number>;
}

/** How many search steps a round may take before repeated pairings are allowed */
const SEARCH_BUDGET = 200_000;

/**
 * Pairs one round (DTTB WO D 7.6): entries with the same number of wins meet as far as possible, the upper half of
 * each such bracket against its lower half. Whoever is left over plays the best entry with fewer wins that they
 * have not met yet. With an odd number the bye goes to the lowest entry that has not had a free win.
 * A pairing is only repeated when the round cannot be paired otherwise.
 */
export function pairSwissRound(input: SwissPairingInput): SwissRound {
  const { ranked, wins } = input;
  const met = new Set(input.previous.flatMap((r) => r.pairs.map(([a, b]) => pairKey(a, b))));
  if (ranked.length % 2 === 0) return { pairs: pairEven(ranked, wins, met) ?? pairEven(ranked, wins, new Set())! };

  // Odd: try the bye from the bottom of the table up, those with the fewest free wins first.
  const free = (id: EntryId) => input.freeWins?.get(id) ?? 0;
  const candidates = ranked
    .map((id, index) => ({ id, index }))
    .sort((a, b) => free(a.id) - free(b.id) || b.index - a.index)
    .map((c) => c.id);
  for (const bye of candidates) {
    const pairs = pairEven(ranked.filter((id) => id !== bye), wins, met);
    if (pairs) return { pairs, bye };
  }
  const bye = candidates[0]!;
  return { pairs: pairEven(ranked.filter((id) => id !== bye), wins, new Set())!, bye };
}

/** A complete pairing of an even number of entries without repeats, or null if there is none (within the budget) */
function pairEven(ranked: readonly EntryId[], wins: ReadonlyMap<EntryId, number>, met: ReadonlySet<string>): [EntryId, EntryId][] | null {
  const pairs: [EntryId, EntryId][] = [];
  let budget = SEARCH_BUDGET;

  const search = (open: readonly EntryId[]): boolean => {
    if (open.length === 0) return true;
    if (budget-- <= 0) return false;
    const [top, ...rest] = open as [EntryId, ...EntryId[]];
    // The entries level with `top` come first in `rest`; its natural opponent is the first of their lower half.
    const level = rest.filter((id) => wins.get(id) === wins.get(top)).length;
    const natural = Math.max(0, Math.floor((level + 1) / 2) - 1);
    const candidates = [
      ...rest.slice(natural, level),
      ...rest.slice(0, natural).reverse(),
      ...rest.slice(level),
    ];
    for (const opponent of candidates) {
      if (met.has(pairKey(top, opponent))) continue;
      pairs.push([top, opponent]);
      if (search(rest.filter((id) => id !== opponent))) return true;
      pairs.pop();
    }
    return false;
  };
  return search(ranked) ? pairs : null;
}
