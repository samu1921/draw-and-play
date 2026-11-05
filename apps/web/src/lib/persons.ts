/** A person as the admin list shows it */
export interface NamedPerson {
  name: string;
  /** The name in public views (short form, if switched on); falls back to `name` */
  publicName?: string;
  firstName?: string;
  lastName?: string | null;
}

/** "Muster, Max" for sorted lists, or just "Max" without a last name */
export function listName(p: NamedPerson): string {
  if (p.firstName === undefined) return p.name;
  return p.lastName ? `${p.lastName}, ${p.firstName}` : p.firstName;
}

/** Lower-cased public names shared by more than one person (ignoring case and surrounding spaces) */
export function duplicateNames(persons: readonly NamedPerson[]): Set<string> {
  const counts = new Map<string, { name: string; count: number }>();
  for (const p of persons) {
    const name = (p.publicName ?? p.name).trim();
    const key = name.toLocaleLowerCase();
    const found = counts.get(key);
    if (found) found.count++;
    else counts.set(key, { name, count: 1 });
  }
  return new Set([...counts.values()].filter((c) => c.count > 1).map((c) => c.name.toLocaleLowerCase()));
}

/** Whether a person looks the same as somebody else in public views */
export function isDuplicate(p: NamedPerson, duplicates: ReadonlySet<string>): boolean {
  return duplicates.has((p.publicName ?? p.name).trim().toLocaleLowerCase());
}
