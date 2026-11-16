import type { Database } from '../db/index.ts';
import { conflict, invalid, notFound } from '../errors.ts';
import { tierFor } from './redemptions.ts';
import { earnedIds } from './visibility.ts';
import { publicSummary } from './publicViews.ts';

const RESERVED = new Set(['admin', 'api', 'me', 'profil', 'profile', 'badges', 'goslar', 'machmit', 'machmithaus', 'support', 'hilfe']);
export const MAX_SHOWCASE = 6;

export interface ProfileInput {
  handle?: string | null;
  displayName?: string | null;
  public?: boolean;
  showcase?: string[];
}

/**
 * Profile und Showcase. Privat, bis die Person es selbst öffentlich schaltet.
 * Anzeigename und Kürzel wählt sie selbst – nichts davon kommt aus der Goslar ID.
 */
export class ProfileService {
  constructor(private db: Database, private publicBaseUrl: string, private now: () => number = Date.now) {}

  private url(handle: string | null, isPublic: boolean) {
    return handle && isPublic ? `${this.publicBaseUrl.replace(/\/$/, '')}/u/${handle}` : null;
  }

  async mine(userSub: string) {
    const p = await this.db.selectFrom('profiles').selectAll().where('user_sub', '=', userSub).executeTakeFirst();
    return {
      handle: p?.handle ?? null,
      displayName: p?.display_name ?? null,
      public: p?.public ?? false,
      showcase: p?.showcase ?? [],
      url: this.url(p?.handle ?? null, p?.public ?? false),
    };
  }

  async update(userSub: string, input: ProfileInput) {
    const current = await this.mine(userSub);
    const handle = input.handle === undefined ? current.handle : input.handle?.trim().toLowerCase() || null;
    const displayName = input.displayName === undefined ? current.displayName : input.displayName?.trim() || null;
    const isPublic = input.public ?? current.public;
    const showcase = input.showcase ?? current.showcase;

    if (handle && RESERVED.has(handle)) throw invalid('Dieses Kürzel ist reserviert');
    if (isPublic && !handle) throw invalid('Für ein öffentliches Profil brauchst du ein Kürzel');
    if (new Set(showcase).size !== showcase.length) throw invalid('Jedes Abzeichen nur einmal');
    if (showcase.length > MAX_SHOWCASE) throw invalid(`Höchstens ${MAX_SHOWCASE} Abzeichen im Showcase`);
    if (showcase.length) {
      const earned = await earnedIds(this.db, userSub, showcase);
      if (showcase.some((id) => !earned.has(id))) throw invalid('Im Showcase können nur Abzeichen stehen, die du gesammelt hast');
    }
    if (handle) {
      const taken = await this.db.selectFrom('profiles').select('user_sub').where('handle', '=', handle).where('user_sub', '<>', userSub).executeTakeFirst();
      if (taken) throw conflict('handle_taken', 'Dieses Kürzel ist schon vergeben');
    }
    const values = { handle, display_name: displayName, public: isPublic, showcase, updated_at: new Date(this.now()) };
    await this.db.insertInto('profiles').values({ user_sub: userSub, ...values })
      .onConflict((oc) => oc.column('user_sub').doUpdateSet(values)).execute();
    return this.mine(userSub);
  }

  /** Öffentliche Ansicht. Versteckte Abzeichen bleiben für Betrachtende Platzhalter, die sie selbst nicht haben. */
  async publicProfile(handle: string, viewerSub?: string) {
    const p = await this.db.selectFrom('profiles').selectAll().where('handle', '=', handle.toLowerCase()).where('public', '=', true).executeTakeFirst();
    if (!p) throw notFound('Profil');
    const awards = await this.db.selectFrom('awards')
      .innerJoin('achievements', 'achievements.id', 'awards.achievement_id')
      .select(['awards.achievement_id', 'awards.progress', 'awards.tier', 'achievements.org_id', 'achievements.name', 'achievements.kind',
        'achievements.spec', 'achievements.hidden', 'achievements.hint', 'achievements.required_count', 'achievements.vetoed_at'])
      .where('awards.user_sub', '=', p.user_sub).where('awards.tier', '>=', 1)
      .execute();
    const visible = awards.filter((a) => a.vetoed_at === null);
    const ids = p.showcase.filter((id) => visible.some((a) => a.achievement_id === id));
    const tiers = ids.length ? await this.db.selectFrom('achievement_tiers').select(['achievement_id', 'threshold']).where('achievement_id', 'in', ids).execute() : [];
    const viewerEarned = await earnedIds(this.db, viewerSub, ids);
    return {
      handle: p.handle!,
      displayName: p.display_name,
      stats: { badges: visible.length, tiers: visible.reduce((n, a) => n + a.tier, 0) },
      showcase: ids.map((id) => {
        const a = visible.find((x) => x.achievement_id === id)!;
        const revealed = viewerEarned.has(id) || viewerSub === p.user_sub;
        return {
          achievement: publicSummary({ id, org_id: a.org_id, name: a.name, kind: a.kind, spec: a.spec, hidden: a.hidden, hint: a.hint }, revealed),
          tier: a.tier,
          tierCount: tierFor(tiers.filter((t) => t.achievement_id === id), a.progress).tierCount,
          progress: a.progress,
          requiredCount: a.required_count,
        };
      }),
    };
  }
}
