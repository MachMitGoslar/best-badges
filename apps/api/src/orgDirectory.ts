// Zugriff auf Organisationen und Mitgliedschaften aus dem HSP.
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

export interface UserDirectoryEntry {
  hspProfileId: string;
  displayName: string | null;
  organisationIds: string[];
}

export interface OrgDirectory {
  /** Profil und Mitgliedschaften einer Person; braucht das Token der Person. */
  lookupUser(sub: string, accessToken: string): Promise<UserDirectoryEntry>;
  getOrganisation(id: string, accessToken: string): Promise<Organisation | null>;
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

  constructor(
    private baseUrl: string,
    opts: { membershipTtlSec: number; orgTtlSec: number },
    private fetchFn: typeof fetch = fetch,
  ) {
    this.users = new StaleWhileErrorCache(opts.membershipTtlSec * 1000);
    this.orgs = new StaleWhileErrorCache(opts.orgTtlSec * 1000);
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
}
