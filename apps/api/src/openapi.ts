// OpenAPI in zwei Fassungen: öffentlich (App, Partner) und intern (Verwaltung, Nachkontrolle).
// Ausblenden ist kein Schutz – geschützt sind die Endpunkte durch Anmeldung und Rechteprüfung.
// Die Trennung macht die Schnittstelle für externe Entwicklerinnen klar und zeigt nicht mehr als nötig.

/** Bereiche der öffentlichen Doku. Alles andere ist intern. */
export const PUBLIC_TAGS = new Set(['Öffentlich', 'Sammlung', 'Einlösen', 'Orte', 'Profil', 'Benachrichtigungen', 'Integrationen']);

type Doc = { paths?: Record<string, Record<string, { tags?: string[] }>>; components?: { schemas?: Record<string, unknown> } & Record<string, unknown>; tags?: { name: string }[] };

/** Nur Operationen mit ausschließlich öffentlichen Tags; nicht mehr benötigte Schemas fallen weg. */
export function publicDocument<T extends object>(full: T): T {
  const doc = structuredClone(full) as Doc;
  const paths: NonNullable<Doc['paths']> = {};
  for (const [path, ops] of Object.entries(doc.paths ?? {})) {
    const kept = Object.fromEntries(Object.entries(ops).filter(([, op]) => (op.tags ?? []).length > 0 && op.tags!.every((t) => PUBLIC_TAGS.has(t))));
    if (Object.keys(kept).length) paths[path] = kept;
  }
  doc.paths = paths;

  // Erreichbare Schemas einsammeln (transitiv über $ref)
  const schemas = doc.components?.schemas ?? {};
  const used = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string' && v.startsWith('#/components/schemas/')) {
        const name = v.slice('#/components/schemas/'.length);
        if (!used.has(name)) { used.add(name); walk(schemas[name]); }
      } else walk(v);
    }
  };
  walk(doc.paths);
  if (doc.components?.schemas) doc.components.schemas = Object.fromEntries(Object.entries(schemas).filter(([n]) => used.has(n)));
  if (doc.tags) doc.tags = doc.tags.filter((t) => PUBLIC_TAGS.has(t.name));
  return doc as T;
}
