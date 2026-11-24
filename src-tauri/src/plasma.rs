//! plasma widget on kde
//!
//! the widget talks to the app over the session bus. packages install it
//! system wide, anything else, like the appimage, gets it copied into the
//! user's data folder along with the dbus service that lets it start the app

use std::{
    fs,
    path::{Path, PathBuf},
};

/// id of the widget, also its folder
const ID: &str = "dev.danfq.borealis";

/// files of the widget, relative to its folder
const WIDGET: [(&str, &str); 3] = [
    (
        "metadata.json",
        include_str!("../../packaging/plasma/dev.danfq.borealis/metadata.json"),
    ),
    (
        "contents/ui/main.qml",
        include_str!("../../packaging/plasma/dev.danfq.borealis/contents/ui/main.qml"),
    ),
    (
        "contents/images/icon.svg",
        include_str!("../../packaging/plasma/dev.danfq.borealis/contents/images/icon.svg"),
    ),
];

/// dbus service file, relative to the data folders
const SERVICE: &str = "dbus-1/services/dev.danfq.Borealis.service";

/// data folder of packages
const SYSTEM: &str = "/usr/share";

/// make the widget available on plasma, unless a package did already
///
/// development builds stay out of it so the service never points at them
pub fn install() {
    if cfg!(debug_assertions) || !is_plasma() {
        return;
    }

    let Some(data) = data_home() else { return };

    let folder = Path::new("plasma/plasmoids").join(ID);

    if !Path::new(SYSTEM)
        .join(&folder)
        .join("metadata.json")
        .exists()
    {
        for (file, contents) in WIDGET {
            write(&data.join(&folder).join(file), contents);
        }
    }

    if !Path::new(SYSTEM).join(SERVICE).exists()
        && let Some(executable) = executable()
    {
        let service = format!("[D-BUS Service]\nName=dev.danfq.Borealis\nExec={executable}\n");
        write(&data.join(SERVICE), &service);
    }
}

/// check whether the desktop is kde plasma
///
/// @returns {boolean} true on plasma
fn is_plasma() -> bool {
    std::env::var("XDG_CURRENT_DESKTOP")
        .is_ok_and(|desktop| desktop.split(':').any(|name| name == "KDE"))
}

/// data folder of the user
///
/// @returns {PathBuf | None} folder
fn data_home() -> Option<PathBuf> {
    std::env::var_os("XDG_DATA_HOME")
        .filter(|path| !path.is_empty())
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| Path::new(&home).join(".local/share")))
}

/// command starting this app, the appimage itself rather than its mount
///
/// @returns {String | None} quoted path
fn executable() -> Option<String> {
    let path = std::env::var_os("APPIMAGE")
        .map(PathBuf::from)
        .or_else(|| std::env::current_exe().ok())?;

    Some(format!("\"{}\"", path.to_str()?.replace('"', "\\\"")))
}

/// write a file when its contents changed, best effort
///
/// @param path file path
/// @param contents file contents
fn write(path: &Path, contents: &str) {
    if fs::read_to_string(path).is_ok_and(|current| current == contents) {
        return;
    }

    if let Some(folder) = path.parent() {
        let _ = fs::create_dir_all(folder);
    }

    let _ = fs::write(path, contents);
}
