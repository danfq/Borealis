#[cfg(target_os = "macos")]
mod about;
mod accounts;
#[cfg(target_os = "linux")]
mod dbus;
#[cfg(target_os = "linux")]
mod memory;
#[cfg(target_os = "macos")]
mod notifications;
mod search;
mod session;
mod settings;
#[cfg(target_os = "macos")]
mod shortcuts;
#[cfg(any(target_os = "macos", target_os = "windows"))]
mod tray;

/// id of the about menu item
#[cfg(target_os = "macos")]
const ABOUT: &str = "about";

/// id of the settings menu item
#[cfg(target_os = "macos")]
const SETTINGS: &str = "settings";

/// default macos menu with the stock about item swapped for ours
///
/// @param app app handle
///
/// @returns {Menu} app menu
#[cfg(target_os = "macos")]
fn menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{Menu, MenuItem, MenuItemKind, PredefinedMenuItem};

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

        // settings sit right under about, as in every mac app
        app_menu.insert(&PredefinedMenuItem::separator(app)?, 1)?;
        app_menu.insert(
            &MenuItem::with_id(app, SETTINGS, "Settings…", true, Some("Cmd+,"))?,
            2,
        )?;
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

/// bring the window back and to the front, wherever it was left
///
/// @param app app handle
pub fn reveal<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    #[cfg(target_os = "macos")]
    let _ = app.show();

    if let Some(window) = tauri::Manager::get_window(app, session::WINDOW) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// leave the app, closing the window may only minimize it
#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // native file dialogs on every desktop, gtk falls back to its own without a portal
    #[cfg(target_os = "linux")]
    if std::env::var_os("GTK_USE_PORTAL").is_none() {
        // safety: nothing else is running before the builder starts
        unsafe { std::env::set_var("GTK_USE_PORTAL", "1") };
    }

    // calls need shared memory, which webkitgtk keeps off unless asked,
    // the web processes inherit it from here
    #[cfg(target_os = "linux")]
    if std::env::var_os("JSC_useSharedArrayBuffer").is_none() {
        // safety: nothing else is running before the builder starts
        unsafe { std::env::set_var("JSC_useSharedArrayBuffer", "1") };
    }

    // a second launch shows the running app, two would share the same sessions
    #[cfg(target_os = "linux")]
    let bus = match dbus::claim() {
        dbus::Claim::Running => return,
        dbus::Claim::Owned(bus) => Some(bus),
        dbus::Claim::Unavailable => None,
    };

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(session::Sessions::default())
        .manage(accounts::Accounts::default())
        .invoke_handler(tauri::generate_handler![
            quit,
            accounts::set_accounts,
            settings::get_settings,
            settings::set_settings,
            session::show_session,
            session::start_session,
            session::hide_session,
            session::remove_session,
            session::answer_permission,
            search::search,
            search::search_results,
            search::open_search_result,
        ])
        .setup(move |app| {
            let store = settings::Store::load(app.handle())?;
            tauri::Manager::manage(app, store);

            // sessions need an overlay to be positioned on linux
            #[cfg(target_os = "linux")]
            if let Some(main) = tauri::Manager::get_webview_window(app, "main") {
                session::linux::install(&main)?;
            }

            // the plasma widget lists the accounts through the bus
            #[cfg(target_os = "linux")]
            if let Some(bus) = bus {
                bus.attach(app.handle());
                tauri::Manager::manage(app, bus);
            }

            // accounts are a click away from the menu bar or the taskbar
            #[cfg(any(target_os = "macos", target_os = "windows"))]
            tray::install(app.handle())?;

            // clicked notifications open their chat
            #[cfg(target_os = "macos")]
            notifications::install(app.handle());

            // sessions swallow keys while focused
            #[cfg(target_os = "macos")]
            shortcuts::install(app.handle());

            Ok(())
        })
        .on_window_event(|window, event| {
            // keep sessions running and notifying in the background
            if let tauri::WindowEvent::CloseRequested { api, .. } = event
                && settings::current(tauri::Manager::app_handle(window)).minimize_on_close
            {
                api.prevent_close();
                let _ = window.minimize();
            }
        });

    // web contexts take their memory limits when created, before setup runs
    #[cfg(target_os = "linux")]
    let builder = builder.plugin(memory::plugin());

    // other platforms keep the window free of a menu bar
    #[cfg(target_os = "macos")]
    let builder = builder.menu(menu).on_menu_event(|app, event| {
        if event.id() == ABOUT {
            show_about(app);
        }

        if event.id() == SETTINGS {
            let _ = tauri::Emitter::emit_to(app, session::WINDOW, session::SETTINGS_EVENT, ());
        }
    });

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
