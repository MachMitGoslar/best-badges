// Zugriff auf Organisationen, Mitgliedschaften und POI aus dem HSP.
import { fromHspOpeningHours, type Schedule } from './services/schedule.ts';
// Das Badge-System speichert keine eigenen Organisationsdaten, nur Cache.

export interface Organisation {
  id: string;
  name: string | null;
  street: string | null;
  number: string | null;
  postcode: string | null;
  city: string | null;
  logoFileUrl: string | null;
  description: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
}

/** POI einer Organisation (Geschäft, Filiale, Ort) mit Öffnungszeiten als feste Zeiten */
export interface HspPoi {
  id: string;
  orgId: string;
  name: string;
  street: string | null;
  houseNumber: string | null;
  zipCode: string | null;
  city: string | null;
  category: string | null;
  lat: number;
  lng: number;
  openingHours: Schedule | null;
}

export interface UserDirectoryEntry {
  hspProfileId: string;
  displayName: string | null;
  organisationIds: string[];
}

export interface OrgDirectory {
  /** Profil und Mitgliedschaften einer Person; braucht das Token der Person. */
  lookupUser(sub: string, accessToken: string): Promise<UserDirectoryEntry>;
  getOrganisation(id: string, accessToken: string): Promise<Organisation | null>;
  /** POI der Organisation mit Öffnungszeiten; braucht das Token eines Mitglieds. */
  listPointsOfInterest(orgId: string, accessToken: string): Promise<HspPoi[]>;
}

interface CacheEntry<T> { value: T; expiresAt: number }

/** Kleiner TTL-Cache, der bei Fehlern der Quelle den letzten Stand weiterverwendet. */
export class StaleWhileErrorCache<T> {
  private entries = new Map<string, CacheEntry<T>>();
  private inFlight = new Map<string, Promise<T>>();
  constructor(private ttlMs: number, private now: () => number = Date.now) {}

  async get(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.value;
    const running = this.inFlight.get(key);
    if (running) return running;
    const p = load()
      .then((value) => {
        this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
        return value;
      })
      .catch((err) => {
        if (hit) return hit.value; // Quelle ausgefallen: letzter bekannter Stand
        throw err;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, p);
    return p;
  }
}

export class HspOrgDirectory implements OrgDirectory {
  private users: StaleWhileErrorCache<UserDirectoryEntry>;
  private orgs: StaleWhileErrorCache<Organisation | null>;
  private pois: StaleWhileErrorCache<HspPoi[]>;

  constructor(
    private baseUrl: string,
    opts: { membershipTtlSec: number; orgTtlSec: number },
    private fetchFn: typeof fetch = fetch,
  ) {
    this.users = new StaleWhileErrorCache(opts.membershipTtlSec * 1000);
    this.orgs = new StaleWhileErrorCache(opts.orgTtlSec * 1000);
    // POI ändern sich selten, werden aber in der Verwaltung gezielt aufgefrischt: kürzer als Organisationen
    this.pois = new StaleWhileErrorCache(Math.min(opts.orgTtlSec, 300) * 1000);
  }

  private async getJson(path: string, accessToken?: string): Promise<unknown> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HSP ${path} antwortet ${res.status}`);
    return res.json();
  }

  lookupUser(sub: string, accessToken: string): Promise<UserDirectoryEntry> {
    return this.users.get(sub, async () => {
      // Das echte HSP liefert das Profil ohne Anmeldung; wir senden das Token trotzdem mit.
      const profile = (await this.getJson(`/UserAccounts/${encodeURIComponent(sub)}/UserProfile`, accessToken)) as
        | { id?: string; firstName?: string; lastName?: string }
        | null;
      if (!profile?.id) return { hspProfileId: '', displayName: null, organisationIds: [] };
      const memberships = (await this.getJson(
        `/UserProfiles/${encodeURIComponent(profile.id)}/Memberships`,
        accessToken,
      )) as Array<{ organisationId?: string }> | null;
      const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
      return {
        hspProfileId: profile.id,
        displayName: name || null,
        organisationIds: [...new Set((memberships ?? []).map((m) => m.organisationId).filter((id): id is string => !!id))],
      };
    });
  }

  getOrganisation(id: string, accessToken: string): Promise<Organisation | null> {
    return this.orgs.get(id, async () => {
      const o = (await this.getJson(`/Organisations/${encodeURIComponent(id)}`, accessToken)) as Partial<Organisation> | null;
      if (!o) return null;
      const s = (v: unknown) => (typeof v === 'string' ? v : null);
      return {
        id,
        name: s(o.name), street: s(o.street), number: s(o.number), postcode: s(o.postcode), city: s(o.city),
        logoFileUrl: s(o.logoFileUrl), description: s(o.description), websiteUrl: s(o.websiteUrl), contactEmail: s(o.contactEmail),
      };
    });
  }

  listPointsOfInterest(orgId: string, accessToken: string): Promise<HspPoi[]> {
    return this.pois.get(orgId, async () => {
      const raw = (await this.getJson(`/Organisations/${encodeURIComponent(orgId)}/PointsOfInterest`, accessToken)) as unknown[] | null;
      const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
      const list = (raw ?? []).flatMap((x) => {
        const p = x as Record<string, unknown>;
        const lat = Number(p.latitude), lng = Number(p.longitude);
        const id = s(p.id), name = s(p.name);
        // Ohne Kennung, Namen oder gültige Koordinaten taugt ein POI nicht als Ort
        if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return [];
        return [{ id, orgId, name, street: s(p.street), houseNumber: s(p.houseNumber), zipCode: s(p.zipCode), city: s(p.city),
          category: s(p.firstCategory) ?? s(p.secondCategory), lat, lng, openingHours: null as Schedule | null }];
      });
      // Öffnungszeiten je POI; ein Fehler dort macht den POI nicht unbrauchbar
      await Promise.all(list.map(async (poi) => {
        try {
          const hours = (await this.getJson(`/Organisations/${encodeURIComponent(orgId)}/PointsOfInterest/${encodeURIComponent(poi.id)}/OpeningHours`, accessToken)) as
            { dayOfWeek?: number; from?: string; to?: string }[] | null;
          poi.openingHours = fromHspOpeningHours(hours ?? []);
        } catch { /* ohne Öffnungszeiten weiter */ }
      }));
      return list;
    });
  }
}
