import { groupLetter } from '@draw-and-play/domain';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CompetitionStateInfo, MatchInfo } from '../lib/api.js';
import { matchLabel } from '../lib/describe.js';

/** Names, open sides and scores of a competition, shared by the live views and the projector */
export function useCompetitionText(state: () => CompetitionStateInfo) {
  const { t } = useI18n();

  const nameOf = computed(() => new Map(state().entries.map((e) => [e.id, e.members.map((m) => m.name).join(' / ')])));
  const name = (id: string | null) => (id ? (nameOf.value.get(id) ?? '?') : '—');

  /** "Semifinal 2" when a round has several matches, so "winner semifinal 2" is unambiguous */
  function numberedLabel(key: string): string {
    const matches = state().matches;
    const m = matches.find((x) => x.key === key);
    if (!m) return '';
    const siblings = matches.filter((x) => x.phase === m.phase && x.round === m.round && x.places?.[0] === m.places?.[0] && x.group === m.group);
    const label = matchLabel(t, m);
    return siblings.length > 1 && m.phase === 'knockout' ? `${label} ${siblings.indexOf(m) + 1}` : label;
  }

  /** Entry name, or where the side will come from while it is still open */
  function sideText(m: MatchInfo, side: 0 | 1): string {
    const id = m.sides[side];
    if (id) return name(id);
    const source = m.sources?.[side];
    if (source?.type === 'qualifier') return t('public.qualifier', { rank: source.rank, group: groupLetter(source.group) });
    if (source?.type === 'winner') return t('public.winnerOf', { match: numberedLabel(source.matchKey) });
    if (source?.type === 'loser') return t('public.loserOf', { match: numberedLabel(source.matchKey) });
    return '—';
  }

  function score(m: MatchInfo): string {
    if (!m.result) return '';
    if (m.result.walkover) return t('public.walkover');
    const won = m.result.games.filter(([a, b]) => a > b).length;
    return `${won}:${m.result.games.length - won}`;
  }
  const gameScores = (m: MatchInfo) => m.result?.games.map(([a, b]) => `${a}:${b}`).join(', ') ?? '';

  return { name, sideText, score, gameScores };
}
