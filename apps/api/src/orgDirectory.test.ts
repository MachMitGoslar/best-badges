import { describe, it, expect } from 'vitest';
import { StaleWhileErrorCache } from './orgDirectory.ts';

describe('StaleWhileErrorCache', () => {
  it('lädt innerhalb der TTL nur einmal', async () => {
    let now = 0, loads = 0;
    const cache = new StaleWhileErrorCache<number>(1000, () => now);
    const load = async () => ++loads;
    expect(await cache.get('k', load)).toBe(1);
    now = 500;
    expect(await cache.get('k', load)).toBe(1);
    now = 1500;
    expect(await cache.get('k', load)).toBe(2);
  });

  it('nutzt den letzten Stand, wenn die Quelle ausfällt', async () => {
    let now = 0;
    const cache = new StaleWhileErrorCache<string>(1000, () => now);
    await cache.get('k', async () => 'alt');
    now = 5000;
    expect(await cache.get('k', async () => { throw new Error('HSP down'); })).toBe('alt');
  });

  it('wirft ohne vorhandenen Stand den Fehler weiter', async () => {
    const cache = new StaleWhileErrorCache<string>(1000);
    await expect(cache.get('k', async () => { throw new Error('HSP down'); })).rejects.toThrow('HSP down');
  });

  it('bündelt gleichzeitige Ladevorgänge', async () => {
    let loads = 0;
    const cache = new StaleWhileErrorCache<number>(1000);
    const load = () => new Promise<number>((r) => setTimeout(() => r(++loads), 10));
    const [a, b] = await Promise.all([cache.get('k', load), cache.get('k', load)]);
    expect([a, b, loads]).toEqual([1, 1, 1]);
  });
});
