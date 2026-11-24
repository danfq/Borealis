//! menu bar item on macos and tray icon on windows
//!
//! both list the accounts with their unread chats, so any of them is a click
//! away, next to the settings

use tauri::{
    AppHandle, Emitter,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
};

use crate::{
    accounts,
    session::{OPEN_EVENT, SETTINGS_EVENT, WINDOW},
};

/// id of the tray icon
const TRAY: &str = "borealis";

/// id of the item bringing the window back
const SHOW: &str = "tray-show";

/// id of the settings item
const SETTINGS: &str = "tray-settings";

/// id of the quit item
const QUIT: &str = "tray-quit";

/// start of the id of every account item, followed by the account id
const ACCOUNT_PREFIX: &str = "tray-account-";

/// add the icon
///
/// @param app app handle
pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let builder = TrayIconBuilder::with_id(TRAY)
        .tooltip(tooltip(0))
        .menu(&menu(app)?)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| select(app, event.id().as_ref()));

    // macos tints template images to match the menu bar
    #[cfg(target_os = "macos")]
    let builder = builder
        .icon(tauri::include_image!("icons/tray.png"))
        .icon_as_template(true);

    #[cfg(target_os = "windows")]
    let builder = match app.default_window_icon() {
        Some(icon) => builder.icon(icon.clone()),
        None => builder,
    };

    builder.build(app)?;

    Ok(())
}

/// rebuild the menu and the unread count from the current accounts
///
/// @param app app handle
pub fn update(app: &AppHandle) {
    let Some(tray) = app.tray_by_id(TRAY) else {
        return;
    };

    if let Ok(menu) = menu(app) {
        let _ = tray.set_menu(Some(menu));
    }

    let unread: u32 = accounts::list(app)
        .iter()
        .map(|account| account.unread)
        .sum();

    // the menu bar has room for the count next to the icon
    #[cfg(target_os = "macos")]
    let _ = tray.set_title((unread > 0).then(|| unread.to_string()));

    let _ = tray.set_tooltip(Some(tooltip(unread)));
}

/// text shown when hovering the icon
///
/// @param unread unread chats across every account
///
/// @returns {String} tooltip
fn tooltip(unread: u32) -> String {
    match unread {
        0 => "Borealis".to_owned(),
        1 => "Borealis (1 unread chat)".to_owned(),
        count => format!("Borealis ({count} unread chats)"),
    }
}

/// menu listing every account, the window and the settings
///
/// @param app app handle
///
/// @returns {Menu} menu
fn menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;
    let accounts = accounts::list(app);

    if accounts.is_empty() {
        menu.append(&MenuItem::new(app, "No accounts yet", false, None::<&str>)?)?;
    }

    for (index, account) in accounts.iter().enumerate() {
        let label = match account.unread {
            0 => account.name.clone(),
            count => format!("{} ({count})", account.name),
        };

        // the same shortcuts switch accounts in the window
        let shortcut = (index < 9).then(|| format!("CmdOrCtrl+{}", index + 1));

        menu.append(&CheckMenuItem::with_id(
            app,
            format!("{ACCOUNT_PREFIX}{}", account.id),
            label,
            true,
            account.active,
            shortcut.as_deref(),
        )?)?;
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(
        app,
        SHOW,
        "Show Borealis",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        SETTINGS,
        "Settings…",
        true,
        Some("CmdOrCtrl+,"),
    )?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(
        app,
        QUIT,
        "Quit Borealis",
        true,
        Some("CmdOrCtrl+Q"),
    )?)?;

    Ok(menu)
}

/// run the item picked from the menu
///
/// @param app app handle
/// @param id item id
fn select(app: &AppHandle, id: &str) {
    match id {
        SHOW => crate::reveal(app),
        SETTINGS => {
            crate::reveal(app);
            let _ = app.emit_to(WINDOW, SETTINGS_EVENT, ());
        }
        QUIT => app.exit(0),
        _ => {
            let Some(account) = id.strip_prefix(ACCOUNT_PREFIX) else {
                return;
            };

            crate::reveal(app);
            let _ = app.emit_to(WINDOW, OPEN_EVENT, account);

            // picking the open account unchecks it natively, the menu is
            // rebuilt so the check follows the account on screen
            update(app);
        }
    }
}
