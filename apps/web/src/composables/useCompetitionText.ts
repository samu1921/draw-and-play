import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CompetitionStateInfo, MatchInfo } from '../lib/api.js';
import { competitionText } from '../lib/competitionText.js';
import type { Translate } from '../lib/describe.js';

/** Names, open sides and scores of a competition, shared by the live views and the projector */
export function useCompetitionText(state: () => CompetitionStateInfo) {
  const { t } = useI18n();
  const text = computed(() => competitionText(t as Translate, state()));
  return {
    name: (id: string | null) => text.value.name(id),
    sideText: (m: MatchInfo, side: 0 | 1) => text.value.sideText(m, side),
    score: (m: MatchInfo) => text.value.score(m),
    gameScores: (m: MatchInfo) => text.value.gameScores(m),
  };
}
