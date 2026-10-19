FROM node:24-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/domain/package.json ./packages/domain/package.json

RUN npm ci --workspace=@suth/web --workspace=@suth/domain --include-workspace-root=false

COPY apps/web ./apps/web
COPY packages/domain ./packages/domain

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build --workspace @suth/web \
    && test -s /app/apps/web/dist/index.html

FROM nginx:1.28-alpine

COPY apps/web/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
