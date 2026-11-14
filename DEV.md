# Developing Borealis

Borealis is built with [Tauri](https://tauri.app), [React](https://react.dev) and [React Router](https://reactrouter.com). Every WhatsApp account runs in its own WhatsApp Web session, a child webview with a separate data store, inside a single window.

## Requirements

- [Rust](https://rustup.rs)
- [Bun](https://bun.sh)
- [just](https://github.com/casey/just)
- The [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform

## Getting started

```sh
just install  # install frontend dependencies
just dev      # run the Rust backend and React frontend together
```

Other useful recipes:

| Recipe         | Description                                                 |
| -------------- | ----------------------------------------------------------- |
| `just web`     | Run the React frontend alone in the browser                 |
| `just build`   | Debug build of the app, without bundling                    |
| `just check`   | Type check the frontend and backend                         |
| `just lint`    | Lint the backend with Clippy                                |
| `just fmt`     | Format the frontend and backend                             |
| `just ci`      | Run every check used before committing                      |
| `just memory`  | Report the memory used by the app and its webview processes |
| `just release` | Cut a release, see [Releasing](#releasing)                  |
| `just site`    | Run the website locally, see [Website](#website)            |
| `just clean`   | Remove build artifacts and dependencies                     |

Run `just` to list every available recipe.

### Notifications on macOS

macOS only delivers notifications to bundled apps. With `just dev`, permission prompts work, but notifications are not shown. To try them, build an app bundle:

```sh
bun run tauri build --debug --bundles app
```

## Project structure

| Path                      | Contents                                                          |
| ------------------------- | ----------------------------------------------------------------- |
| `src/`                    | React frontend: the shell, settings, search and account list      |
| `src/router.tsx`          | Routes, using React Router's data mode (`createBrowserRouter`)    |
| `src-tauri/src/`          | Rust backend: sessions, settings, search and platform integration |
| `src-tauri/src/*.js`      | Scripts injected into the WhatsApp sessions                       |
| `src-tauri/capabilities/` | What the app and the WhatsApp sessions are allowed to call        |
| `scripts/`                | Release and notarization scripts                                  |
| `packaging/`              | Packaging for distributions Tauri doesn't bundle for              |
| `site/`                   | The website at [getborealis.app](https://getborealis.app)         |

Tauri falls back to `index.html` for unknown paths, so browser-style URLs work in production too.

WhatsApp sessions are remote pages, so every app command is declared in `src-tauri/build.rs` and has to be granted by a capability. The sessions can only report search results.

Sessions swallow every key press while focused, so app shortcuts are caught natively on macOS and Linux. On Windows they only work while the app's own interface has focus.

## Releasing

```sh
just release --dry-run  # show the commits and the version they lead to
just release            # bump, commit, tag and push the release
```

The version is worked out from every commit since the last release tag, oldest first:

- A breaking change (`feat!:` or a `BREAKING CHANGE:` footer) bumps the major version.
- `feat` bumps the minor version.
- Everything else bumps the patch version.

Minor and patch never go above 9. Going past 9 resets the segment to 0 and carries one into the segment before it, so `0.1.9` becomes `0.2.0` and `0.9.9` becomes `1.0.0`. The major version has no limit. The first release counts every commit in the history, starting from the version in `package.json`. A dry run works from any branch, even with uncommitted changes.

The new version is written to `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` and `packaging/arch/PKGBUILD`, committed as `chore(release): vX.Y.Z` and tagged. Pushing the tag starts the [release workflow](.github/workflows/release.yml), which builds:

| Platform | Package                                                              |
| -------- | -------------------------------------------------------------------- |
| macOS    | Universal DMG, signed and notarized when the signing secrets are set |
| Windows  | NSIS installer                                                       |
| Linux    | AppImage                                                             |
| Arch     | pacman package, built from the Debian one                            |

The release stays a draft until every package is uploaded, then it is published with the notes stored in the tag.

Apple notarizes the macOS build in the background, so the runner doesn't wait for it. The release starts with a note saying notarization is underway, and the [notarization workflow](.github/workflows/notarization.yml) checks on Apple every 10 minutes and updates that note once Apple is done. It turns itself on for each release and off again when nothing is pending.

### Signing

Signing and notarizing the macOS build needs these repository secrets:

| Secret                       | Value                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `APPLE_CERTIFICATE`          | The Developer ID Application certificate, exported as `.p12` and base64 encoded |
| `APPLE_CERTIFICATE_PASSWORD` | The password chosen when exporting the `.p12`                                   |
| `APPLE_SIGNING_IDENTITY`     | The certificate's name, like `Developer ID Application: Name (TEAMID)`          |
| `APPLE_API_KEY`              | The ID of the App Store Connect API key used to notarize                        |
| `APPLE_API_ISSUER`           | The issuer ID of that key                                                       |
| `APPLE_API_PRIVATE_KEY`      | The contents of the key's `.p8` file                                            |

Without `APPLE_CERTIFICATE`, the DMG is only signed ad hoc and isn't notarized.

## Website

The website at [getborealis.app](https://getborealis.app) lives in `site/`. It's an [Astro](https://astro.build) site styled with [Tailwind CSS](https://tailwindcss.com), with its own dependencies.

```sh
just site  # run the website locally with hot reload
```

The home page is rendered on every visit, so its download links, version and file sizes always match the latest GitHub release. The release is cached for 5 minutes, so GitHub isn't asked on every visit. Everything else on the site is static.

### Deploying

The site runs on Coolify from `site/docker-compose.yml`, which builds the `Dockerfile` and runs Astro's Node server on port 80. To set it up in Coolify:

1. Add this repository as a **Docker Compose** resource, with `/site` as the base directory and `/docker-compose.yml` as the compose file.
2. Set the domain of the `site` service to `https://getborealis.app`.
3. Set the watch paths to `site/**`, so only changes to the site deploy it.
4. Turn on automatic deploys.

Coolify then deploys the site whenever `site/` changes on `main`. Releases don't need a deploy, the site shows them within a few minutes of being published.

The DNS record for `getborealis.app` points at the Coolify server and isn't proxied, so Coolify can issue the HTTPS certificate.

## Recommended IDE setup

[VS Code](https://code.visualstudio.com) with the extensions listed in `.vscode/extensions.json`. Format on save is preconfigured: Prettier handles the frontend and rust-analyzer handles Rust.
