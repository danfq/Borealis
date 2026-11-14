<p align="center">
  <img src="src/assets/icon.svg" width="128" height="128" alt="Borealis logo" />
</p>

<h1 align="center">Borealis</h1>

<p align="center">
  A lightweight, multi-account WhatsApp desktop client.
</p>

Borealis runs every WhatsApp account in its own isolated WhatsApp Web session inside a single native window. It is built with [Tauri](https://tauri.app), so it uses the system webview instead of shipping a browser.

## Features

- **Multiple accounts.** Each account has its own session and data store, so logins never mix.
- **Sidebar or top bar.** Show your accounts in a collapsible sidebar, or in a top bar merged into the titlebar.
- **Unread badges.** Every account shows how many chats are waiting for you.
- **Search across accounts.** Find people, messages and files in all of your accounts at once.
- **Background sessions.** Optionally start every account on launch, so all of them notify you right away.
- **Notifications and permissions.** Choose whether WhatsApp may use notifications, the microphone and the camera, or ask every time.
- **Calls.** WhatsApp's voice and video calls are enabled on macOS, where sessions run on WebKit, the engine Safari uses.
- **Native feel.** Native context menus, the macOS About panel and a Settings menu item, no focus rings, and colors that blend into WhatsApp.

## Keyboard shortcuts

| Action                   | macOS                                     | Windows and Linux                             |
| ------------------------ | ----------------------------------------- | --------------------------------------------- |
| Switch to account 1 to 9 | <kbd>⌘</kbd> <kbd>1</kbd> to <kbd>9</kbd> | <kbd>Ctrl</kbd> <kbd>1</kbd> to <kbd>9</kbd>  |
| Search                   | <kbd>⌘</kbd> <kbd>F</kbd>                 | <kbd>Ctrl</kbd> <kbd>F</kbd>                  |
| Open settings            | <kbd>⌘</kbd> <kbd>,</kbd>                 | <kbd>Ctrl</kbd> <kbd>,</kbd>                  |
| Toggle the sidebar       | <kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>S</kbd>    | <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>S</kbd> |
| Quit                     | <kbd>⌘</kbd> <kbd>Q</kbd>                 | <kbd>Ctrl</kbd> <kbd>Q</kbd>                  |

WhatsApp keeps its own shortcuts, such as <kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>F</kbd> to search inside a chat. On Windows, the app's shortcuts only work while the Borealis interface has focus, not inside a WhatsApp session.

## Requirements

- [Rust](https://rustup.rs)
- [Bun](https://bun.sh)
- [just](https://github.com/casey/just)
- The [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform

## Development

```sh
just install  # install frontend dependencies
just dev      # run the Rust backend and React frontend together
```

Other useful recipes:

| Recipe        | Description                                                 |
| ------------- | ----------------------------------------------------------- |
| `just web`    | Run the React frontend alone in the browser                 |
| `just build`  | Debug build of the app, without bundling                    |
| `just check`  | Type check the frontend and backend                         |
| `just lint`   | Lint the backend with Clippy                                |
| `just fmt`    | Format the frontend and backend                             |
| `just ci`     | Run every check used before committing                      |
| `just memory` | Report the memory used by the app and its webview processes |
| `just clean`  | Remove build artifacts and dependencies                     |

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

Tauri falls back to `index.html` for unknown paths, so browser-style URLs work in production too.

WhatsApp sessions are remote pages, so every app command is declared in `src-tauri/build.rs` and has to be granted by a capability. The sessions can only report search results.

## Recommended IDE setup

[VS Code](https://code.visualstudio.com) with the extensions listed in `.vscode/extensions.json`. Format on save is preconfigured: Prettier handles the frontend and rust-analyzer handles Rust.
