# syntax=docker/dockerfile:1

# --- Build: install everything, build frontend and server ---
# The output is plain JavaScript, so this stage always runs on the build machine's own platform,
# also when the image is built for other platforms.
FROM --platform=$BUILDPLATFORM node:26-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build

# --- Runtime dependencies (server only) ---
# Also runs on the build machine: npm fetches the prebuilt native modules (argon2) for the target
# platform, which works because no runtime dependency has an install script.
FROM --platform=$BUILDPLATFORM node:26-alpine AS deps
ARG TARGETARCH
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
# The frontend only has devDependencies (it is built statically), so only server packages end up here.
RUN cpu="$(case "$TARGETARCH" in amd64) echo x64;; "") node -p process.arch;; *) echo "$TARGETARCH";; esac)" \
 && npm ci --omit=dev --os=linux --cpu="$cpu" --libc=musl

# --- Runtime ---
FROM node:26-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    WEB_DIST=/app/web \
    MIGRATIONS_DIR=/app/drizzle
WORKDIR /app
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/server/drizzle ./drizzle
COPY --from=build /repo/apps/web/dist ./web
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "--enable-source-maps", "dist/index.js"]
