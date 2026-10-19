FROM node:22-bookworm-slim AS base
WORKDIR /app/frontend

FROM base AS dev
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend .
EXPOSE 5173
CMD ["sh", "-c", "npm install && npm run dev -- --host 0.0.0.0 --port ${VITE_DEV_PORT:-7847}"]

FROM base AS build
ARG APP_VERSION=0.1.0
ARG GIT_SHA=
ENV VITE_APP_VERSION=$APP_VERSION \
    VITE_GIT_SHA=$GIT_SHA
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend .
RUN npm run build

FROM nginx:alpine AS prod
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
