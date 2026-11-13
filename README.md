# Borealis

Desktop app built with [Tauri](https://tauri.app), [React](https://react.dev) and [React Router](https://reactrouter.com).

## Requirements

- [Rust](https://rustup.rs)
- [Bun](https://bun.sh)
- [just](https://github.com/casey/just)

## Development

```sh
just install  # install frontend dependencies
just dev      # run the Rust backend and React frontend together
```

Run `just` to list every available recipe.

## Routing

Routes are defined in `src/router.tsx` using React Router's data mode (`createBrowserRouter`). Tauri falls back to `index.html` for unknown paths, so browser-style URLs work in production too.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com) with the extensions listed in `.vscode/extensions.json`. Format on save is preconfigured: Prettier handles the frontend and rust-analyzer handles Rust.
