// POI aus dem HSP: Kopie für die öffentliche Anzeige, Quelle bleibt das HSP.
// Aufgefrischt, wenn Mitglieder der Organisation ihre POI abrufen (mit ihrem Token). Die App fragt das HSP nie selbst.
import type { Database } from '../db/index.ts';
import type { Poi } from '../db/types.ts';
import type { OrgDirectory } from '../orgDirectory.ts';
import { invalid } from '../errors.ts';
import { publicSummary, type PublicSummary } from './publicViews.ts';
import { describe as describeSchedule, type Schedule } from './schedule.ts';
import { earnedIds } from './visibility.ts';

/** Kurzform am Abzeichen und in Listen */
export interface PoiRef {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
}

export interface PoiView extends PoiRef {
  category: string | null;
  openingHours: Schedule | null;
  openingHoursText: string | null;
  /** Im HSP nicht mehr vorhanden; bestehende Bezüge bleiben */
  removed: boolean;
}

export interface PublicPoi extends PoiRef {
  category: string | null;
  openingHoursText: string | null;
  achievements: PublicSummary[];
}

export const poiAddress = (p: Pick<Poi, 'street' | 'house_number' | 'zip_code' | 'city'>) =>
  [[p.street, p.house_number].filter(Boolean).join(' '), [p.zip_code, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null;

export const poiRef = (p: Poi): PoiRef => ({ id: p.id, name: p.name, address: poiAddress(p), lat: p.lat, lng: p.lng });

const toView = (p: Poi): PoiView => ({
  ...poiRef(p), category: p.category, openingHours: p.opening_hours,
  openingHoursText: describeSchedule(p.opening_hours) || null, removed: p.removed_at !== null,
});

export class PoiService {
  constructor(private db: Database, private directory: OrgDirectory, private now: () => number = Date.now) {}

  /** POI der Organisation aus dem HSP holen und die Kopie abgleichen. Fällt das HSP aus, gilt der letzte Stand. */
  async refresh(orgId: string, accessToken: string): Promise<PoiView[]> {
    let fresh;
    try {
      fresh = await this.directory.listPointsOfInterest(orgId, accessToken);
    } catch (err) {
      console.warn(`POI für ${orgId} nicht abrufbar, nutze Kopie:`, (err as Error).message);
      return this.list(orgId);
    }
    const now = new Date(this.now());
    await this.db.transaction().execute(async (trx) => {
      for (const p of fresh) {
        const values = {
          org_id: orgId, name: p.name.slice(0, 200), street: p.street, house_number: p.houseNumber, zip_code: p.zipCode, city: p.city,
          category: p.category, lat: p.lat, lng: p.lng, opening_hours: p.openingHours ? JSON.stringify(p.openingHours) : null,
          fetched_at: now, removed_at: null,
        };
        await trx.insertInto('pois').values({ id: p.id, ...values })
          .onConflict((oc) => oc.column('id').doUpdateSet(values)).execute();
      }
      // Im HSP verschwunden: als entfernt markieren, nicht löschen (Abzeichen und Orte behalten den Bezug)
      let gone = trx.updateTable('pois').set({ removed_at: now }).where('org_id', '=', orgId).where('removed_at', 'is', null);
      if (fresh.length) gone = gone.where('id', 'not in', fresh.map((p) => p.id));
      await gone.execute();
    });
    return this.list(orgId);
  }

  /** Bekannte POI der Organisation (Kopie) */
  async list(orgId: string): Promise<PoiView[]> {
    const rows = await this.db.selectFrom('pois').selectAll().where('org_id', '=', orgId).where('removed_at', 'is', null).orderBy('name').execute();
    return rows.map(toView);
  }

  /** POI muss der Organisation gehören und im HSP noch vorhanden sein. */
  async requireOwned(orgId: string, poiId: string): Promise<Poi> {
    const p = await this.db.selectFrom('pois').selectAll().where('id', '=', poiId).executeTakeFirst();
    if (!p || p.org_id !== orgId) throw invalid('Dieser Ort gehört nicht zu deiner Organisation. Lade die Liste der Orte neu.');
    if (p.removed_at) throw invalid('Diesen Ort gibt es im HSP nicht mehr');
    return p;
  }

  async byIds(ids: string[]): Promise<Map<string, Poi>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.selectFrom('pois').selectAll().where('id', 'in', [...new Set(ids)]).execute();
    return new Map(rows.map((r) => [r.id, r]));
  }

  /** Öffentlich: POI, die gerade verfügbare Abzeichen haben – für die Karte in der App. */
  async publicList(userSub?: string): Promise<PublicPoi[]> {
    const now = new Date(this.now());
    const rows = await this.db.selectFrom('achievements')
      .innerJoin('pois', 'pois.id', 'achievements.poi_id')
      .select(['achievements.id as a_id', 'achievements.org_id', 'achievements.name as a_name', 'achievements.kind', 'achievements.spec',
        'achievements.hidden', 'achievements.hint', 'pois.id as poi_id'])
      .where('achievements.status', '=', 'live').where('achievements.vetoed_at', 'is', null)
      .where((eb) => eb.or([eb('achievements.available_from', 'is', null), eb('achievements.available_from', '<=', now)]))
      .where((eb) => eb.or([eb('achievements.available_until', 'is', null), eb('achievements.available_until', '>', now)]))
      .orderBy('achievements.name').limit(2000).execute();
    if (rows.length === 0) return [];
    const pois = await this.byIds(rows.map((r) => r.poi_id));
    const earned = await earnedIds(this.db, userSub, rows.map((r) => r.a_id));
    const out = new Map<string, PublicPoi>();
    for (const r of rows) {
      const p = pois.get(r.poi_id)!;
      const entry = out.get(p.id) ?? { ...poiRef(p), category: p.category, openingHoursText: describeSchedule(p.opening_hours) || null, achievements: [] };
      entry.achievements.push(publicSummary({ id: r.a_id, org_id: r.org_id, name: r.a_name, kind: r.kind, spec: r.spec, hidden: r.hidden, hint: r.hint }, earned.has(r.a_id)));
      out.set(p.id, entry);
    }
    return [...out.values()];
  }
}
