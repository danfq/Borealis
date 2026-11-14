set shell := ["zsh", "-cu"]

tauri := "src-tauri"
manifest := tauri / "Cargo.toml"

# list available recipes
default:
    @just --list --unsorted

# install frontend dependencies
install:
    bun install

# run rust backend and react frontend together with hot reload
dev: _deps
    bun run tauri dev

# run react frontend only in the browser
web: _deps
    bun run dev

# preview the built frontend in the browser
preview: _deps
    bun run build
    bun run preview

# debug build of the app without bundling
build: _deps
    bun run tauri build --debug --no-bundle

# type check frontend and backend
check: _deps
    bun run check
    cargo check --manifest-path {{ manifest }}

# lint backend with clippy
lint:
    cargo clippy --manifest-path {{ manifest }} --all-targets -- -D warnings

# format frontend and backend code
fmt: _deps
    bun run format
    cargo fmt --manifest-path {{ manifest }}

# check formatting without writing changes
fmt-check: _deps
    bun run format:check
    cargo fmt --manifest-path {{ manifest }} -- --check

# run backend tests
test:
    cargo test --manifest-path {{ manifest }}

# run every check used before committing
ci: fmt-check lint check test

# cut a release from the commits since the last one, ci builds and publishes it
release *args: _deps
    bun scripts/release.ts {{ args }}

# report memory used by the running app and its webview processes
memory:
    scripts/memory.sh

# remove build artifacts and dependencies
clean:
    rm -rf dist node_modules
    cargo clean --manifest-path {{ manifest }}

# install dependencies only when missing
[private]
_deps:
    @[ -d node_modules ] || bun install
