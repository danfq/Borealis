# builds the website and serves it with nginx
#
# the download links are read from the latest github release while building

FROM oven/bun:1 AS build
WORKDIR /site

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# docker compares the feed's content, so the build below only reuses its cache
# while no release has been published since
ADD https://github.com/danfq/Borealis/releases.atom /tmp/releases.atom
RUN bun run build

FROM nginx:1-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /site/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://127.0.0.1/ || exit 1
