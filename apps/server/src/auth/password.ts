import { hash, verify } from '@node-rs/argon2';

// Argon2id with the library defaults (19 MiB memory, 2 iterations), as recommended by OWASP.
export const hashPassword = (password: string) => hash(password);

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** A valid hash to verify against when the user does not exist, so timing does not reveal usernames. */
let dummyHash: Promise<string> | undefined;
export const dummyPasswordHash = () => (dummyHash ??= hash('not-a-real-password'));
