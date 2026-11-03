import type { ResultError } from '@draw-and-play/domain';
import { ApiRequestError } from './api.js';
import type { Translate } from './describe.js';

type Has = (key: string) => boolean;

/** Translated text for a result-notation error from the domain parser */
export function resultErrorText(t: Translate, error: ResultError): string {
  switch (error.code) {
    case 'empty':
      return t('result.errors.empty');
    case 'invalidToken':
    case 'gameAfterMatchEnd':
      return t(`result.errors.${error.code}`, { token: error.token });
    case 'invalidGame':
      return t('result.errors.invalidGame', { token: error.token, reason: t(`result.reasons.${error.reason}`) });
  }
}

/** Translated text for any error thrown by an API call */
export function errorText(t: Translate, has: Has, error: unknown): string {
  if (!(error instanceof ApiRequestError)) return t('errors.generic', { code: String(error) });
  if (error.code === 'invalidResult' && error.details && typeof error.details === 'object' && 'code' in error.details) {
    return resultErrorText(t, error.details as ResultError);
  }
  const key = `errors.${error.code}`;
  return has(key) ? t(key) : t('errors.generic', { code: error.code });
}
