import { describe, it, expect } from 'vitest';
import { BadgeSpecSchema, ICON_IDS, materialForTier, randomSpec, rarityFromShare, type BadgeSpec } from './index.ts';

const valid: BadgeSpec = { version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'forest', motif: { type: 'icon', ref: 'trees' }, palette: 'moss' } };
const withMotif = (motif: unknown) => ({ ...valid, emblem: { ...valid.emblem, motif } });

describe('BadgeSpecSchema', () => {
  it('akzeptiert eine gültige Spezifikation', () => {
    expect(BadgeSpecSchema.parse(valid)).toEqual(valid);
  });

  it('lehnt unbekannte Icons, Paletten, Formen und Versionen ab', () => {
    expect(BadgeSpecSchema.safeParse(withMotif({ type: 'icon', ref: 'gibt-es-nicht' })).success).toBe(false);
    expect(BadgeSpecSchema.safeParse({ ...valid, emblem: { ...valid.emblem, palette: 'pink' } }).success).toBe(false);
    expect(BadgeSpecSchema.safeParse({ ...valid, emblem: { ...valid.emblem, shape: 'star' } }).success).toBe(false);
    expect(BadgeSpecSchema.safeParse({ ...valid, version: 2 }).success).toBe(false);
  });

  it('erlaubt Monogramme nur aus 1–3 Buchstaben oder Ziffern', () => {
    expect(BadgeSpecSchema.safeParse(withMotif({ type: 'monogram', text: 'GÖ' })).success).toBe(true);
    expect(BadgeSpecSchema.safeParse(withMotif({ type: 'monogram', text: '10' })).success).toBe(true);
    expect(BadgeSpecSchema.safeParse(withMotif({ type: 'monogram', text: 'ABCD' })).success).toBe(false);
    expect(BadgeSpecSchema.safeParse(withMotif({ type: 'monogram', text: '<s>' })).success).toBe(false);
    expect(BadgeSpecSchema.safeParse(withMotif({ type: 'monogram', text: '' })).success).toBe(false);
  });

  it('erlaubt Logos nur per HTTPS oder als eigener Speicherpfad', () => {
    expect(BadgeSpecSchema.safeParse(withMotif({ type: 'logo', url: 'https://cdn.example.test/logo.png' })).success).toBe(true);
    expect(BadgeSpecSchema.safeParse(withMotif({ type: 'logo', url: '/files/org-1/logo.png' })).success).toBe(true);
    for (const url of ['http://example.test/x.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,AAAA', 'https://x.test/a"onload="b', '//evil.test/x.png', '/files/../etc/passwd', '/etc/passwd', '/files/.hidden']) {
      expect(BadgeSpecSchema.safeParse(withMotif({ type: 'logo', url })).success, url).toBe(false);
    }
  });
});

describe('materialForTier', () => {
  it('nutzt feste Leitern bis fünf Stufen', () => {
    expect([1, 2, 3].map((t) => materialForTier(t, 3))).toEqual(['bronze', 'silver', 'gold']);
    expect([1, 2, 3, 4, 5].map((t) => materialForTier(t, 5))).toEqual(['wood', 'bronze', 'silver', 'gold', 'crystal']);
    expect(materialForTier(1, 1)).toBe('gold');
  });

  it('verteilt mehr als fünf Stufen aufsteigend und endet bei Kristall', () => {
    const order = ['wood', 'bronze', 'silver', 'gold', 'crystal'];
    const seq = Array.from({ length: 9 }, (_, i) => order.indexOf(materialForTier(i + 1, 9)));
    expect(seq[0]).toBe(0);
    expect(seq.at(-1)).toBe(4);
    for (let i = 1; i < seq.length; i++) expect(seq[i]!).toBeGreaterThanOrEqual(seq[i - 1]!);
  });

  it('begrenzt Stufen auf den gültigen Bereich', () => {
    expect(materialForTier(0, 3)).toBe('bronze');
    expect(materialForTier(9, 3)).toBe('gold');
  });
});

describe('rarityFromShare', () => {
  it('bleibt bei wenigen Sammelnden gewöhnlich', () => {
    expect(rarityFromShare(1, 10)).toBe('common');
    expect(rarityFromShare(0, 0)).toBe('common');
  });

  it('stuft nach Anteil ein', () => {
    expect(rarityFromShare(2, 100)).toBe('legendary');
    expect(rarityFromShare(5, 100)).toBe('epic');
    expect(rarityFromShare(20, 100)).toBe('rare');
    expect(rarityFromShare(60, 100)).toBe('common');
  });
});

describe('randomSpec', () => {
  it('ist reproduzierbar und erzeugt immer gültige Spezifikationen', () => {
    expect(randomSpec(42)).toEqual(randomSpec(42));
    for (let seed = 1; seed <= 300; seed++) expect(BadgeSpecSchema.safeParse(randomSpec(seed)).success).toBe(true);
  });

  it('streut über den Katalog', () => {
    const icons = new Set(Array.from({ length: 300 }, (_, i) => (randomSpec(i).emblem.motif as { ref: string }).ref));
    expect(icons.size).toBeGreaterThan(ICON_IDS.length * 0.6);
  });
});
