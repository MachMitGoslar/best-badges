import { describe, it, expect } from 'vitest';
import { contrast, dark, game, mmh } from './index.ts';

describe('MMH Game – Kontraste', () => {
  const text: [string, string, string][] = [
    ['Text auf Seite', dark.fgDefault, dark.bgPage],
    ['Text auf Karte', dark.fgDefault, dark.bgCard],
    ['Nebentext auf Karte', dark.fgMuted, dark.bgCard],
    ['Nebentext auf Seite', dark.fgMuted, dark.bgPage],
    ['Schrift auf Gelb', dark.onBrand, dark.brand],
    ['Gelbe Schrift auf Karte', dark.brandInk, dark.bgCard],
    ['Erfolg', dark.successFg, dark.successSoftBg],
    ['Fehler', dark.errorFg, dark.errorSoftBg],
    ['Warnung', dark.warningFg, dark.warningSoftBg],
    ['Text auf Nacht oben', dark.fgDefault, game.nightTop],
    ['Nebentext auf Nacht-Panel', dark.fgMuted, game.panelRaised],
  ];
  for (const [name, fg, bg] of text) {
    it(`${name} erreicht 4.5:1`, () => expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5));
  }

  it('Seltenheiten unterscheiden sich in der Helligkeit (nicht nur im Farbton)', () => {
    const r = game.rarity;
    const vsNight = [r.common, r.rare, r.epic, r.legendary].map((c) => contrast(c, game.nightTop));
    expect(vsNight.every((c) => c >= 3)).toBe(true);
    expect(contrast(r.legendary, r.epic)).toBeGreaterThan(1.4);
    expect(contrast(r.rare, r.legendary)).toBeGreaterThan(1.4);
  });

  it('nutzt die Markenfarbe des MMH-Systems unverändert', () => {
    expect(dark.brand).toBe(mmh.ripeMango[700]);
    expect(dark.onBrand).toBe(mmh.ripeMango[1400]);
  });
});
