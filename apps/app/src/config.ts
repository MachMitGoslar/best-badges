const required = (v: string | undefined, name: string) => {
  if (!v) throw new Error(`${name} fehlt (siehe apps/app/.env.example)`);
  return v.replace(/\/$/, '');
};

export const config = {
  apiUrl: required(process.env.EXPO_PUBLIC_API_URL, 'EXPO_PUBLIC_API_URL'),
  issuer: required(process.env.EXPO_PUBLIC_OIDC_ISSUER, 'EXPO_PUBLIC_OIDC_ISSUER'),
  clientId: required(process.env.EXPO_PUBLIC_OIDC_CLIENT_ID, 'EXPO_PUBLIC_OIDC_CLIENT_ID'),
  audience: process.env.EXPO_PUBLIC_OIDC_AUDIENCE ?? '',
};
