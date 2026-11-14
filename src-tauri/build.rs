/// app commands, each gets an allow permission the capabilities hand out
///
/// declaring them puts every command behind the capabilities, so whatsapp
/// sessions can only reach what their capability grants
const COMMANDS: &[&str] = &[
    "quit",
    "get_settings",
    "set_settings",
    "show_session",
    "start_session",
    "hide_session",
    "remove_session",
    "answer_permission",
    "search",
    "search_results",
    "open_search_result",
];

fn main() {
    let manifest = tauri_build::AppManifest::new().commands(COMMANDS);

    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to run tauri build");
}
