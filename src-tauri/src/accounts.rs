//! accounts mirrored from the frontend, which owns them, so the menu bar,
//! tray and plasma widget can list them along with their unread chats

use std::{collections::HashMap, sync::Mutex};

use serde::Deserialize;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use serde::Serialize;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

/// longest account name kept, the frontend never gets near it
const NAME_LIMIT: usize = 200;

/// account as listed by the frontend
#[derive(Clone, Deserialize)]
pub struct Account {
    id: String,
    name: String,
}

/// account along with the state of its session
#[cfg(any(target_os = "macos", target_os = "windows"))]
#[derive(Clone, Serialize)]
pub struct Entry {
    pub id: String,
    pub name: String,
    pub unread: u32,

    /// whether its session is the one on screen
    pub active: bool,
}

/// accounts, unread chats and the session on screen
#[derive(Default)]
pub struct Accounts(Mutex<State>);

#[derive(Default)]
struct State {
    accounts: Vec<(Uuid, String)>,
    unread: HashMap<Uuid, u32>,
    active: Option<Uuid>,
}

/// replace the accounts, in the order the frontend shows them
///
/// @param accounts accounts
#[tauri::command]
pub fn set_accounts(app: AppHandle, accounts: Vec<Account>) -> Result<(), String> {
    let accounts = accounts
        .into_iter()
        .map(|account| {
            let id = Uuid::parse_str(&account.id)
                .map_err(|_| format!("invalid account id: {}", account.id))?;
            let name = account.name.trim().chars().take(NAME_LIMIT).collect();

            Ok((id, name))
        })
        .collect::<Result<Vec<_>, String>>()?;

    update(&app, |state| {
        state
            .unread
            .retain(|id, _| accounts.iter().any(|(account, _)| account == id));
        state.accounts = accounts;
    });

    Ok(())
}

/// remember how many chats of an account are unread
///
/// @param app app handle
/// @param id account id
/// @param count unread chats
pub fn set_unread(app: &AppHandle, id: Uuid, count: u32) {
    update(app, |state| {
        state.unread.insert(id, count);
    });
}

/// remember which session is on screen
///
/// @param app app handle
/// @param id account id, none when no session is
pub fn set_active(app: &AppHandle, id: Option<Uuid>) {
    update(app, |state| state.active = id);
}

/// every account with the state of its session
///
/// @param app app handle
///
/// @returns {Entry[]} accounts
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn list(app: &AppHandle) -> Vec<Entry> {
    let Some(accounts) = app.try_state::<Accounts>() else {
        return Vec::new();
    };

    let state = accounts.0.lock().unwrap();

    state
        .accounts
        .iter()
        .map(|(id, name)| Entry {
            id: id.to_string(),
            name: name.clone(),
            unread: state.unread.get(id).copied().unwrap_or(0),
            active: state.active == Some(*id),
        })
        .collect()
}

/// change the state and refresh whatever lists the accounts when it differs
///
/// @param app app handle
/// @param change change to make
fn update(app: &AppHandle, change: impl FnOnce(&mut State)) {
    let Some(accounts) = app.try_state::<Accounts>() else {
        return;
    };

    let changed = {
        let mut state = accounts.0.lock().unwrap();
        let before = (state.accounts.clone(), state.unread.clone(), state.active);

        change(&mut state);

        before != (state.accounts.clone(), state.unread.clone(), state.active)
    };

    // the lock is released first, the menu reads the accounts again
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    if changed {
        crate::tray::update(app);
    }

    #[cfg(target_os = "linux")]
    let _ = changed;
}
