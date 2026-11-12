import { groupLetter } from '@draw-and-play/domain';
import type { CompetitionStateInfo, MatchInfo } from './api.js';
import { matchLabel, type Translate } from './describe.js';

/** Names, open sides and scores of one competition; used by the live views, the projector and the print pages */
export function competitionText(t: Translate, state: CompetitionStateInfo) {
  const nameOf = new Map(state.entries.map((e) => [e.id, e.members.map((m) => m.name).join(' / ')]));
  const clubsOf = new Map(state.entries.map((e) => [e.id, [...new Set(e.members.map((m) => m.club).filter((c): c is string => !!c))].join(' / ')]));
  const name = (id: string | null) => (id ? (nameOf.get(id) ?? '?') : '—');
  const clubs = (id: string | null) => (id ? (clubsOf.get(id) ?? '') : '');

  /** "Semifinal 2" when a round has several matches, so "winner semifinal 2" is unambiguous */
  function numberedLabel(key: string): string {
    const m = state.matches.find((x) => x.key === key);
    if (!m) return '';
    const siblings = state.matches.filter((x) => x.phase === m.phase && x.round === m.round && x.places?.[0] === m.places?.[0] && x.group === m.group);
    const label = matchLabel(t, m);
    return siblings.length > 1 && m.phase === 'knockout' ? `${label} ${siblings.indexOf(m) + 1}` : label;
  }

  /** Entry name (with rotating partners both players), or where the side will come from while it is still open */
  function sideText(m: MatchInfo, side: 0 | 1): string {
    const id = m.sides[side];
    const partner = m.partners?.[side];
    if (id && partner) return `${name(id)} / ${name(partner)}`;
    if (id) return name(id);
    const source = m.sources?.[side];
    if (source?.type === 'qualifier') {
      // A Swiss system has one table, so the rank needs no group
      return state.competition.format.swiss ? t('public.tableRank', { rank: source.rank }) : t('public.qualifier', { rank: source.rank, group: groupLetter(source.group) });
    }
    if (source?.type === 'bestNext') {
      // "Another" only next to those of the same rank that advance to the main bracket
      const key = source.advancing ? 'public.bestNext' : state.nextRanked?.rank === source.rank ? 'public.otherNext' : 'public.anyNext';
      return t(key, { rank: source.rank });
    }
    if (source?.type === 'swiss') return t('public.notPaired');
    if (source?.type === 'winner') return t('public.winnerOf', { match: numberedLabel(source.matchKey) });
    if (source?.type === 'loser') return t('public.loserOf', { match: numberedLabel(source.matchKey) });
    return '—';
  }

  /** Clubs of a side, with rotating partners those of both players */
  function sideClubs(m: MatchInfo, side: 0 | 1): string {
    const ids = [m.sides[side], m.partners?.[side] ?? null].filter((id): id is string => id !== null);
    return [...new Set(ids.map(clubs).filter((c) => c !== ''))].join(' / ');
  }

  function score(m: MatchInfo): string {
    if (!m.result) return '';
    if (m.withdrawal && m.phase === 'rotation') return t('public.annulled');
    if (m.result.walkover) return t('public.walkover');
    const won = m.result.games.filter(([a, b]) => a > b).length;
    return `${won}:${m.result.games.length - won}`;
  }
  const gameScores = (m: MatchInfo) => m.result?.games.map(([a, b]) => `${a}:${b}`).join(', ') ?? '';

  return { name, clubs, numberedLabel, sideText, sideClubs, score, gameScores };
}
