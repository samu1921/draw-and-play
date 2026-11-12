import type { CompetitionFormat, ConsolationMode, FormatSettings, PlacementMode } from '@draw-and-play/domain';

/** The settings of a format as a form holds them; each format takes those that have an effect on it */
export interface FormatForm {
  placements: PlacementMode;
  /** What the entries eliminated in the group stage do */
  consolation: ConsolationMode | 'none';
  /** The best of the next group rank fill the knockout bracket */
  fillByes: boolean;
  /** Rounds of a Swiss system; null = the recommended number for the entries */
  swissRounds: number | null;
}

export const defaultFormatForm = (): FormatForm => ({ placements: 'none', consolation: 'none', fillByes: false, swissRounds: null });

/** Form values for `generateVariants`; fields missing from drafts saved by older versions fall back to the defaults */
export function formatSettings(form: Partial<FormatForm>): FormatSettings {
  const rounds = Number(form.swissRounds);
  return {
    placements: form.placements ?? 'none',
    ...(form.consolation && form.consolation !== 'none' && { consolation: form.consolation }),
    ...(form.fillByes && { fillByes: true }),
    ...(form.swissRounds != null && Number.isInteger(rounds) && rounds > 0 && { swissRounds: rounds }),
  };
}

/** The form values a stored format was built from */
export function formatFormOf(format: CompetitionFormat): FormatForm {
  return {
    placements: format.knockout?.placements ?? 'none',
    consolation: format.knockout?.consolation ?? 'none',
    fillByes: format.knockout?.fillByes ?? false,
    swissRounds: format.swiss?.rounds ?? null,
  };
}
