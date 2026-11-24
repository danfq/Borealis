//! session bus service on linux
//!
//! lets the plasma widget list the accounts and open them, and makes a second
//! launch bring up the running app instead of starting another one with the
//! same sessions

use std::sync::{Arc, OnceLock};

use tauri::{AppHandle, Emitter};
use uuid::Uuid;
use zbus::{
    blocking::{Connection, connection},
    fdo, interface,
};

use crate::{
    accounts,
    session::{OPEN_EVENT, SETTINGS_EVENT, WINDOW},
};

/// name of the app on the session bus, also its interface
const NAME: &str = "dev.danfq.Borealis";

/// object serving the interface
const PATH: &str = "/dev/danfq/Borealis";

/// app the service acts on, set once tauri is up
type Handle = Arc<OnceLock<AppHandle>>;

/// what the app exposes on the bus
struct Service(Handle);

/// connection holding the name, kept for the life of the app
pub struct Bus {
    _connection: Connection,
    app: Handle,
}

/// outcome of claiming the name
pub enum Claim {
    /// this is the only instance
    Owned(Bus),

    /// another instance holds the name and was asked to show itself
    Running,

    /// no session bus, the app runs without the service
    Unavailable,
}

#[interface(name = "dev.danfq.Borealis")]
impl Service {
    /// accounts with their unread chats and which one is on screen, as json
    fn state(&self) -> String {
        let accounts = self.0.get().map(accounts::list).unwrap_or_default();
        let unread: u32 = accounts.iter().map(|account| account.unread).sum();

        serde_json::json!({ "accounts": accounts, "unread": unread }).to_string()
    }

    /// bring up an account
    ///
    /// @param id account id
    fn open_account(&self, id: &str) -> fdo::Result<()> {
        let id = Uuid::parse_str(id)
            .map_err(|_| fdo::Error::InvalidArgs(format!("invalid account id: {id}")))?;

        if let Some(app) = self.0.get() {
            crate::reveal(app);
            let _ = app.emit_to(WINDOW, OPEN_EVENT, id.to_string());
        }

        Ok(())
    }

    /// bring up the settings
    fn open_settings(&self) {
        if let Some(app) = self.0.get() {
            crate::reveal(app);
            let _ = app.emit_to(WINDOW, SETTINGS_EVENT, ());
        }
    }

    /// bring the window back and to the front
    fn show(&self) {
        if let Some(app) = self.0.get() {
            crate::reveal(app);
        }
    }

    /// leave the app
    fn quit(&self) {
        if let Some(app) = self.0.get() {
            app.exit(0);
        }
    }
}

/// claim the name of the app, or show the instance already holding it
///
/// the object is served before the name is taken, so calls that start the
/// app through dbus activation find it
///
/// @returns {Claim} outcome
pub fn claim() -> Claim {
    let app = Handle::default();

    // zbus lets later owners take names over by default, the first one keeps it
    let connection = connection::Builder::session()
        .and_then(|builder| builder.serve_at(PATH, Service(app.clone())))
        .and_then(|builder| builder.name(NAME))
        .and_then(|builder| {
            builder
                .allow_name_replacements(false)
                .replace_existing_names(false)
                .build()
        });

    match connection {
        Ok(connection) => Claim::Owned(Bus {
            _connection: connection,
            app,
        }),
        Err(zbus::Error::NameTaken) => {
            show_running();
            Claim::Running
        }
        Err(_) => Claim::Unavailable,
    }
}

/// ask the instance holding the name to show itself
fn show_running() {
    let Ok(connection) = Connection::session() else {
        return;
    };

    let _ = connection.call_method(Some(NAME), PATH, Some(NAME), "Show", &());
}

impl Bus {
    /// let the service act on the app
    ///
    /// @param app app handle
    pub fn attach(&self, app: &AppHandle) {
        let _ = self.app.set(app.clone());
    }
}
