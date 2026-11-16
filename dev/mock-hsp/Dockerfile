FROM node:22.20-alpine
WORKDIR /app
COPY src ./src
COPY data ./data
USER node
EXPOSE 4010
CMD ["node", "src/server.mjs"]
