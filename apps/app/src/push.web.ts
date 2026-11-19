// Im Browser kein Push (die Web-Fassung dient nur der Vorschau)
export type PushState = 'unsupported' | 'denied' | 'off' | 'on';
export const pushState = async (): Promise<PushState> => 'unsupported';
export const enablePush = async () => false;
export const disablePush = async () => {};
export const refreshPush = async () => {};
export const setAppBadge = async (_n: number) => {};
export const linkOf = (_r: unknown): string | null => null;
export const useLastNotificationResponse = (): null => null;
