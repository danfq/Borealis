//! app settings persisted as json in the config directory
//!
//! rust owns them since the window, sessions and downloads all depend on them

use std::{fs, path::PathBuf, sync::RwLock};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

/// file holding the settings inside the config directory
const FILE: &str = "settings.json";

/// what happens when a site asks for a permission
#[derive(Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Policy {
    #[default]
    Ask,
    Allow,
    Deny,
}

/// policy for each permission whatsapp may request
#[derive(Clone, Copy, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Permissions {
    pub notifications: Policy,
    pub microphone: Policy,
    pub camera: Policy,
}

/// every user preference
#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// closing the window minimizes it so sessions keep running
    pub minimize_on_close: bool,

    /// pick a location for every download instead of the downloads folder
    pub ask_download_location: bool,

    pub permissions: Permissions,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            minimize_on_close: true,
            ask_download_location: true,
            permissions: Permissions::default(),
        }
    }
}

/// settings shared across threads along with their file
pub struct Store {
    path: PathBuf,
    settings: RwLock<Settings>,
}

impl Store {
    /// read the settings file, falling back to defaults when missing or invalid
    ///
    /// @param app app handle
    ///
    /// @returns {Store} store
    pub fn load<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Self> {
        let path = app.path().app_config_dir()?.join(FILE);

        let settings = fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();

        Ok(Self {
            path,
            settings: RwLock::new(settings),
        })
    }

    /// current settings
    ///
    /// @returns {Settings} settings
    pub fn get(&self) -> Settings {
        self.settings.read().unwrap().clone()
    }

    /// replace the settings and write them to disk
    ///
    /// @param settings new settings
    fn save(&self, settings: Settings) -> Result<(), String> {
        let raw = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;

        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }

        // write next to the file first so a crash never leaves it half written
        let temporary = self.path.with_extension("json.tmp");
        fs::write(&temporary, raw).map_err(|e| e.to_string())?;
        fs::rename(&temporary, &self.path).map_err(|e| e.to_string())?;

        *self.settings.write().unwrap() = settings;

        Ok(())
    }
}

/// current settings, defaults until the store is managed
///
/// @param app app handle
///
/// @returns {Settings} settings
pub fn current<R: Runtime>(app: &AppHandle<R>) -> Settings {
    app.try_state::<Store>()
        .map(|store| store.get())
        .unwrap_or_default()
}

/// read the settings
#[tauri::command]
pub fn get_settings(store: tauri::State<'_, Store>) -> Settings {
    store.get()
}

/// replace the settings
///
/// @param settings new settings
#[tauri::command]
pub fn set_settings(store: tauri::State<'_, Store>, settings: Settings) -> Result<(), String> {
    store.save(settings)
}
