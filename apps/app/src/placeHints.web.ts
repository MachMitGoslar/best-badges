// Web: keine Hinweise im Hintergrund
import type { Place } from './places.ts';

export type HintState = 'unsupported' | 'off' | 'on' | 'denied';
export const hintState = async (): Promise<HintState> => 'unsupported';
export const enableHints = async () => false;
export const disableHints = async () => {};
export const syncHints = async (_places: Place[], _pos: { lat: number; lng: number } | null) => {};
