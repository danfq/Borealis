#[cfg(target_os = "macos")]
mod about;

/// id of the about menu item
#[cfg(target_os = "macos")]
const ABOUT: &str = "about";

/// default macos menu with the stock about item swapped for ours
///
/// @param app app handle
///
/// @returns {Menu} app menu
#[cfg(target_os = "macos")]
fn menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{Menu, MenuItem, MenuItemKind};

    let menu = Menu::default(app)?;

    // first submenu is the app menu and its first item is about
    if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() {
        app_menu.remove_at(0)?;
        app_menu.prepend(&MenuItem::with_id(
            app,
            ABOUT,
            "About Borealis",
            true,
            None::<&str>,
        )?)?;
    }

    Ok(menu)
}

/// open the native about panel
///
/// @param app app handle
#[cfg(target_os = "macos")]
fn show_about<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let name = app.package_info().name.clone();
    let version = app.package_info().version.to_string();
    let copyright = app.config().bundle.copyright.clone();

    let _ = app.run_on_main_thread(move || {
        if let Some(mtm) = objc2::MainThreadMarker::new() {
            about::show(mtm, &name, &version, copyright.as_deref());
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());

    // other platforms keep the window free of a menu bar
    #[cfg(target_os = "macos")]
    let builder = builder.menu(menu).on_menu_event(|app, event| {
        if event.id() == ABOUT {
            show_about(app);
        }
    });

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
