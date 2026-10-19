FROM node:24-slim

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/domain/package.json ./packages/domain/package.json

RUN npm ci --omit=dev --workspace=@suth/api --workspace=@suth/domain --include-workspace-root=false \
    && npm cache clean --force

COPY apps/api/index.js ./apps/api/index.js
COPY apps/api/src ./apps/api/src
COPY packages/domain ./packages/domain

RUN mkdir -p /app/uploads /data/import-sessions \
    && test -s /app/package.json \
    && test -s /app/apps/api/package.json \
    && test -s /app/packages/domain/package.json \
    && chown -R node:node /app /data

USER node

EXPOSE 3000

CMD ["node", "apps/api/index.js"]
