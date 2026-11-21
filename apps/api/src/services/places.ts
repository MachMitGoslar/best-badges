import type { Database } from '../db/index.ts';
import { publicSummary, type PublicSummary } from './publicViews.ts';

export interface PlaceView {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  validUntil: string | null;
  achievement: PublicSummary;
  /** Mit Anmeldung: Die Person kann hier (vorerst) nicht mehr einchecken. Ohne Anmeldung null. */
  done: boolean | null;
}

export interface BBox { minLat: number; minLng: number; maxLat: number; maxLng: number }

/** Höchstzahl Orte pro Abfrage – reicht für eine Stadt, die App fragt nach Kartenausschnitt. */
const MAX_PLACES = 500;

/** Öffentliche Orte für Karte und Geofencing in der App. */
export class PlaceService {
  constructor(private db: Database, private now: () => number = Date.now) {}

  async list(userSub: string | undefined, bbox?: BBox): Promise<PlaceView[]> {
    const now = new Date(this.now());
    let q = this.db.selectFrom('codes')
      .innerJoin('achievements', 'achievements.id', 'codes.achievement_id')
      .select([
        'codes.id', 'codes.place_name', 'codes.geo_lat', 'codes.geo_lng', 'codes.geo_radius_m', 'codes.valid_until',
        'codes.per_user_limit', 'codes.per_user_cooldown_seconds',
        'achievements.id as achievement_id', 'achievements.org_id', 'achievements.name', 'achievements.kind',
        'achievements.spec', 'achievements.hidden', 'achievements.hint',
      ])
      .where('codes.template', '=', 'place').where('codes.active', '=', true)
      .where('achievements.status', '=', 'live').where('achievements.vetoed_at', 'is', null)
      .where((eb) => eb.or([eb('codes.valid_from', 'is', null), eb('codes.valid_from', '<=', now)]))
      .where((eb) => eb.or([eb('codes.valid_until', 'is', null), eb('codes.valid_until', '>', now)]))
      .where((eb) => eb.or([eb('codes.max_total', 'is', null), eb('codes.uses', '<', eb.ref('codes.max_total'))]));
    if (bbox) {
      q = q.where('codes.geo_lat', '>=', bbox.minLat).where('codes.geo_lat', '<=', bbox.maxLat)
        .where('codes.geo_lng', '>=', bbox.minLng).where('codes.geo_lng', '<=', bbox.maxLng);
    }
    const rows = await q.orderBy('codes.created_at').limit(MAX_PLACES).execute();
    if (rows.length === 0) return [];

    // Eigener Stand: verdiente Abzeichen und bisherige Check-ins je Ort
    const earned = new Set<string>();
    const visits = new Map<string, { count: number; last: Date }>();
    if (userSub) {
      const achievementIds = [...new Set(rows.map((r) => r.achievement_id))];
      const awards = await this.db.selectFrom('awards').select('achievement_id')
        .where('user_sub', '=', userSub).where('tier', '>=', 1).where('achievement_id', 'in', achievementIds).execute();
      for (const a of awards) earned.add(a.achievement_id);
      const stats = await this.db.selectFrom('redemptions')
        .select(['code_id', (eb) => eb.fn.countAll<string>().as('count'), (eb) => eb.fn.max('created_at').as('last')])
        .where('user_sub', '=', userSub).where('status', '=', 'success').where('code_id', 'in', rows.map((r) => r.id))
        .groupBy('code_id').execute();
      for (const s of stats) if (s.code_id) visits.set(s.code_id, { count: Number(s.count), last: new Date(s.last as Date) });
    }

    return rows.map((r) => {
      let done: boolean | null = null;
      if (userSub) {
        const v = visits.get(r.id);
        const limitReached = r.per_user_limit !== null && (v?.count ?? 0) >= r.per_user_limit;
        const coolingDown = r.per_user_cooldown_seconds !== null && !!v && v.last.getTime() + r.per_user_cooldown_seconds * 1000 > now.getTime();
        done = limitReached || coolingDown;
      }
      return {
        id: r.id,
        name: r.place_name ?? '',
        lat: r.geo_lat!,
        lng: r.geo_lng!,
        radiusM: r.geo_radius_m!,
        validUntil: r.valid_until?.toISOString() ?? null,
        achievement: publicSummary({ id: r.achievement_id, org_id: r.org_id, name: r.name, kind: r.kind, spec: r.spec, hidden: r.hidden, hint: r.hint }, earned.has(r.achievement_id)),
        done,
      };
    });
  }
}
