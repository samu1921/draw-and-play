import type { z } from 'zod';

/**
 * An error the client can act on. `code` is stable and language-neutral; the UI translates it.
 * Example: 409 { error: 'playerBusy', details: { personIds: [...] } }
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

export const notFound = (entity: string) => new ApiError(404, 'notFound', { entity });
export const conflict = (code: string, details?: unknown) => new ApiError(409, code, details);
export const badRequest = (code: string, details?: unknown) => new ApiError(400, code, details);

/** Validates input against a zod schema; failures become 400 { error: 'validation', details: issues } */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(
      400,
      'validation',
      result.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })),
    );
  }
  return result.data;
}
