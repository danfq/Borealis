# builds the website and serves it with astro's node server
#
# the home page is rendered from the latest github release kept in memory, a
# github webhook replaces it the moment a release is published

FROM oven/bun:1 AS build
WORKDIR /site

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# only what the server needs at runtime
FROM oven/bun:1 AS deps
WORKDIR /site

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM node:24-slim
WORKDIR /site

ENV NODE_ENV=production HOST=0.0.0.0 PORT=80

# the server only needs node, the bundled npm ships its own vulnerable undici
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

COPY --from=deps /site/node_modules ./node_modules
COPY --from=build /site/dist ./dist

EXPOSE 80

# checks the home page, so the release is loaded before coolify sends traffic
HEALTHCHECK --interval=10s --timeout=5s CMD ["node", "-e", "fetch('http://127.0.0.1/').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "dist/server/entry.mjs"]
