# syntax=docker/dockerfile:1
# Testumgebung: API und Verwaltung als schlanke Images (Node + gebündelter Code, ohne Paketmanager).
# Bauen:  docker build --target api -t best-badges-api .   bzw.  --target manage
# Für den Server (x86_64) vom Mac aus: --platform linux/amd64. Gebaut wird trotzdem nativ
# (Stufe build auf $BUILDPLATFORM); das Ergebnis ist reines JavaScript, die Laufzeit-Stufen kopieren nur.

FROM --platform=$BUILDPLATFORM node:24.11.1-alpine3.22 AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /src
COPY . .
# Nur was API und Verwaltung brauchen (ohne die Expo-App). Ohne Skripte: der postinstall
# erzeugt die WebView-Seite der App, die hier nicht gebraucht wird.
RUN pnpm install --frozen-lockfile --ignore-scripts \
      --filter @best-badges/api... --filter @best-badges/manage... --filter .
RUN pnpm --filter @best-badges/manage build \
 && node scripts/bundle-servers.mjs /out

FROM node:24.11.1-alpine3.22 AS api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=build /out/api /app
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=4 \
  CMD wget -qO- http://127.0.0.1:3001/health >/dev/null || exit 1
CMD ["node", "--enable-source-maps", "index.mjs"]

FROM node:24.11.1-alpine3.22 AS manage
ENV NODE_ENV=production MANAGE_BFF_HOST=0.0.0.0 MANAGE_BFF_PORT=5174
WORKDIR /app
COPY --from=build /out/manage /app
USER node
EXPOSE 5174
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=4 \
  CMD wget -qO- http://127.0.0.1:5174/auth/session >/dev/null || exit 1
CMD ["node", "--enable-source-maps", "server/index.mjs"]
