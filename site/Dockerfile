# builds the website and serves it with astro's node server
#
# the home page reads the latest github release on request, so new installers
# show up within minutes without a redeploy

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

COPY --from=deps /site/node_modules ./node_modules
COPY --from=build /site/dist ./dist

EXPOSE 80

# a static file, so checks never reach github
HEALTHCHECK --interval=30s --timeout=3s CMD ["node", "-e", "fetch('http://127.0.0.1/robots.txt').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "dist/server/entry.mjs"]
