//! search across every session
//!
//! the app hands the query to each running session, which searches with
//! whatsapp's own chat, contact and message search and answers through
//! `search_results`, the only command whatsapp is allowed to call

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Webview};
use uuid::Uuid;

use crate::session::{self, WINDOW};

/// event carrying the results of a session to the frontend
const RESULTS_EVENT: &str = "search-results";

/// results kept per session, the page is not trusted to limit itself
const LIMIT: usize = 60;

/// what a result points at
#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Chat,
    Contact,
    Message,
    File,
}

/// single match found by a session
#[derive(Clone, Serialize, Deserialize)]
pub struct Match {
    id: String,
    kind: Kind,
    title: String,
    subtitle: String,

    /// unix seconds, only for messages and files
    timestamp: Option<f64>,
}

/// results of a session sent to the frontend
#[derive(Clone, Serialize)]
struct Found {
    token: u32,
    account: String,
    results: Vec<Match>,
}

/// ask every running session to search
///
/// @param token search id echoed back with the results
/// @param query search text
///
/// @returns {usize} sessions asked, each answers once
#[tauri::command]
pub fn search(app: AppHandle, token: u32, query: String) -> Result<usize, String> {
    let query = serde_json::to_string(&query).map_err(|e| e.to_string())?;
    let script = format!("window.__borealisSearch?.search({token}, {query});");

    let asked = app
        .webviews()
        .into_values()
        .filter(|webview| session::account(webview.label()).is_some())
        .filter(|webview| webview.eval(script.clone()).is_ok())
        .count();

    Ok(asked)
}

/// results reported by a session
///
/// @param token search the results belong to
/// @param results matches found
#[tauri::command]
pub fn search_results(
    app: AppHandle,
    webview: Webview,
    token: u32,
    mut results: Vec<Match>,
) -> Result<(), String> {
    // the account comes from the webview, never from the page
    let account = session::account(webview.label()).ok_or("not a session")?;

    results.truncate(LIMIT);

    let found = Found {
        token,
        account: account.to_string(),
        results,
    };

    app.emit_to(WINDOW, RESULTS_EVENT, found)
        .map_err(|e| e.to_string())
}

/// open a result in its session
///
/// @param account account the result belongs to
/// @param id result id
#[tauri::command]
pub fn open_search_result(app: AppHandle, account: String, id: String) -> Result<(), String> {
    let account =
        Uuid::parse_str(&account).map_err(|_| format!("invalid account id: {account}"))?;
    let id = serde_json::to_string(&id).map_err(|e| e.to_string())?;

    let webview = app
        .get_webview(&session::label(&account))
        .ok_or("session is not running")?;

    webview
        .eval(format!("window.__borealisSearch?.open({id});"))
        .map_err(|e| e.to_string())
}
