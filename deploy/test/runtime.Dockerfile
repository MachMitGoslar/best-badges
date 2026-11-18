# Laufzeit-Images der Testumgebung, gebaut AUF DEM SERVER aus den vorab gebündelten Dateien
# (deploy.sh lädt nur api/, manage/ und mock-hsp/ hoch). Keine Installation, kein Bauen: nur Kopieren,
# deshalb auch auf dem knapp bemessenen Server unkritisch. Muss zu den Stufen api/manage im Dockerfile passen.

FROM node:24.11.1-alpine3.22 AS api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY api/ /app/
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=4 \
  CMD wget -qO- http://127.0.0.1:3001/health >/dev/null || exit 1
CMD ["node", "--enable-source-maps", "index.mjs"]

FROM node:24.11.1-alpine3.22 AS manage
ENV NODE_ENV=production MANAGE_BFF_HOST=0.0.0.0 MANAGE_BFF_PORT=5174
WORKDIR /app
COPY manage/ /app/
USER node
EXPOSE 5174
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=4 \
  CMD wget -qO- http://127.0.0.1:5174/auth/session >/dev/null || exit 1
CMD ["node", "--enable-source-maps", "server/index.mjs"]
