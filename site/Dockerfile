# builds the website and serves it with nginx
#
# the download links are read from the latest github release while building,
# so a new release only shows up after a build without cache

FROM oven/bun:1 AS build
WORKDIR /site

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM nginx:1-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /site/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://127.0.0.1/ || exit 1
