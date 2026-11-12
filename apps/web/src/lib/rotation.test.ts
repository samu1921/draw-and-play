import { buildStructure, createRng, drawForStructure, resolveCompetition, tableTennis, type CompetitionFormat } from '@draw-and-play/domain';
import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import de from '../i18n/locales/de.js';
import en from '../i18n/locales/en.js';
import type { CompetitionStateInfo, MatchInfo } from './api.js';
import { competitionText } from './competitionText.js';
import { describeFormat, matchLabel, type Translate } from './describe.js';
import { buildSlides } from './displaySlides.js';
import { variantsFor } from './planDraft.js';
import { competitionRules } from './rules.js';
import { rotationRoundViews } from './stages.js';

const translator = (locale: 'en' | 'de') =>
  createI18n({ legacy: false, locale, messages: { en, de }, missingWarn: false, fallbackWarn: false }).global.t as unknown as Translate;
const rotation: CompetitionFormat = { rotation: {} };

/** A state as the server sends it, for five players P1–P5 */
function stateOf(players: number, results = new Map()): CompetitionStateInfo {
  const structure = buildStructure(rotation, players);
  const ids = Array.from({ length: players }, (_, i) => `P${i + 1}`);
  const draw = drawForStructure(structure, ids.map((id) => ({ id })), createRng('x'));
  const state = resolveCompetition(structure, draw, results, tableTennis.ranking);
  return {
    competition: { id: 'c', name: 'Mix', kind: 'rotation', format: rotation, drawn: true, matchRules: tableTennis.defaultMatchRules } as never,
    entries: ids.map((id) => ({ id, status: 'present', members: [{ id, name: `Name ${id}`, club: `Club ${id}` }] })),
    groups: state.groups.map((g) => ({ ...g })),
    matches: state.matches.map(
      (m): MatchInfo => ({
        id: m.id,
        key: m.id,
        phase: m.phase,
        group: null,
        round: m.round,
        places: null,
        sides: m.sides,
        partners: m.partners ?? null,
        sources: null,
        status: m.status,
        tableId: null,
        calledAt: null,
        finishedAt: null,
        result: m.result ?? null,
        version: 1,
      }),
    ),
    placements: state.placements,
    finished: state.finished,
  };
}

describe('rotating partners in the web app', () => {
  it('describes the format and labels its rounds', () => {
    expect(describeFormat(translator('de'), rotation, 8)).toBe('Wechselnde Partner, jeder mit jedem, 7 Spiele pro Spieler');
    expect(describeFormat(translator('en'), rotation, 6)).toBe('Rotating partners, everybody with everybody, 4 matches per player');
    expect(matchLabel(translator('de'), buildStructure(rotation, 8).matches.at(-1)!)).toBe('Runde 7');
  });

  it('is offered by the planner', () => {
    expect(variantsFor({ entryCount: 8 }).at(-1)?.id).toBe('rotation');
  });

  it('explains the rules, depending on whether everybody partners everybody', () => {
    const rules = (entryCount: number) =>
      competitionRules(translator('en'), { format: rotation, matchRules: tableTennis.defaultMatchRules, ranking: tableTennis.ranking, entryCount, drawn: true });
    const section = rules(8).find((s) => s.title === 'Rotating partners and table')!;
    expect(section.paragraphs[0]).toContain('exactly once, so 7 matches');
    expect(section.ordered?.some((c) => c.startsWith('Head-to-head'))).toBe(false);
    expect(rules(6).find((s) => s.title === 'Rotating partners and table')!.paragraphs[0]).toContain('4 matches, each with another partner');
  });

  it('names both players of a side and lists who sits out', () => {
    const state = stateOf(5);
    const text = competitionText(translator('de'), state);
    const [m] = state.matches;
    expect(text.sideText(m!, 0)).toBe(`Name ${m!.sides[0]} / Name ${m!.partners![0]}`);
    expect(text.sideClubs(m!, 1)).toBe(`Club ${m!.sides[1]} / Club ${m!.partners![1]}`);
    const rounds = rotationRoundViews(state);
    expect(rounds).toHaveLength(5);
    expect(rounds.every((r) => r.matches.length === 1 && r.resting.length === 1 && !r.complete)).toBe(true);
    // Everybody sits out once
    expect(new Set(rounds.flatMap((r) => r.resting)).size).toBe(5);
  });

  it('shows the table and the current round on the projector', () => {
    const state = stateOf(8);
    const slides = buildSlides({
      settings: { tables: false, next: false, competitions: true, rules: false, todayOnly: false } as never,
      today: '2026-01-01',
      competitions: [{ id: 'c', drawn: true, day: null, format: rotation } as never],
      states: new Map([['c', state]]),
      tableIds: [],
    });
    expect(slides.map((s) => s.kind)).toEqual(['groups', 'round']);
    expect(slides[1]).toMatchObject({ round: 1, matchKeys: ['RT-1-1', 'RT-1-2'] });
  });
});
