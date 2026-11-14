//! whatsapp web sessions embedded as child webviews
//!
//! every account gets its own webview and data store so logins stay isolated,
//! the frontend reports where the session should sit and toggles visibility

use std::{path::Path, sync::Mutex};

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, Url, Webview, WebviewBuilder, WebviewUrl,
    webview::{DownloadEvent, NewWindowResponse, PageLoadEvent},
};
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

use crate::settings::{self, Permissions, Policy};

/// whatsapp web entry point
const URL: &str = "https://web.whatsapp.com";

/// chrome user agent, whatsapp web is built for chrome and turns away unknown browsers
#[cfg(target_os = "macos")]
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";

/// chrome user agent, whatsapp web is built for chrome and turns away unknown browsers
#[cfg(target_os = "windows")]
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";

/// chrome user agent, whatsapp web is built for chrome and turns away unknown browsers
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
const USER_AGENT: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";

/// domains the session may navigate within, anything else opens in the browser
const DOMAINS: [&str; 2] = ["whatsapp.com", "whatsapp.net"];

/// label of the window hosting the sessions
pub const WINDOW: &str = "main";

/// event telling the frontend a session waits for a permission answer
#[cfg(any(target_os = "linux", target_os = "macos"))]
pub const PERMISSION_EVENT: &str = "permission-request";

/// webviews forget granted notifications between launches, so ask again
/// silently when they are allowed or whatsapp keeps showing its banner
const NOTIFICATIONS: &str =
    "window.Notification?.permission === 'default' && Notification.requestPermission();";

/// label of the currently visible session
#[derive(Default)]
pub struct Sessions(Mutex<Option<String>>);

/// session area in logical pixels relative to the window
#[derive(Clone, Copy, Deserialize)]
pub struct Bounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// permissions governed by the settings
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Permission {
    Notifications,
    Microphone,
    Camera,
}

/// permission prompt sent to the frontend
#[cfg(any(target_os = "linux", target_os = "macos"))]
#[derive(Clone, Serialize)]
pub struct Prompt {
    pub id: u32,
    pub account: String,
    pub permissions: Vec<Permission>,
}

impl Permission {
    /// configured policy
    ///
    /// @param permissions permission settings
    ///
    /// @returns {Policy} policy
    fn policy(self, permissions: &Permissions) -> Policy {
        match self {
            Self::Notifications => permissions.notifications,
            Self::Microphone => permissions.microphone,
            Self::Camera => permissions.camera,
        }
    }
}

/// create the session if needed, place it and make it the visible one
///
/// @param id account id
/// @param bounds session area
#[tauri::command]
pub async fn show_session(
    app: AppHandle,
    sessions: tauri::State<'_, Sessions>,
    id: String,
    bounds: Bounds,
) -> Result<(), String> {
    let id = parse(&id)?;
    let label = label(&id);

    let webview = match app.get_webview(&label) {
        Some(webview) => webview,
        None => create(&app, &id, bounds).map_err(|e| e.to_string())?,
    };

    let mut active = sessions.0.lock().unwrap();

    // only one session is visible at a time
    if let Some(previous) = active.as_deref().filter(|previous| *previous != label)
        && let Some(previous) = app.get_webview(previous)
    {
        previous.hide().map_err(|e| e.to_string())?;
    }

    place(&app, &webview, bounds).map_err(|e| e.to_string())?;
    webview.show().map_err(|e| e.to_string())?;
    *active = Some(label);

    Ok(())
}

/// hide the visible session, it keeps running in the background
#[tauri::command]
pub async fn hide_session(
    app: AppHandle,
    sessions: tauri::State<'_, Sessions>,
) -> Result<(), String> {
    if let Some(label) = sessions.0.lock().unwrap().take()
        && let Some(webview) = app.get_webview(&label)
    {
        webview.hide().map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// close a session and wipe its data
///
/// @param id account id
#[tauri::command]
pub async fn remove_session(
    app: AppHandle,
    sessions: tauri::State<'_, Sessions>,
    id: String,
) -> Result<(), String> {
    let id = parse(&id)?;
    let label = label(&id);

    let mut active = sessions.0.lock().unwrap();

    if active.as_deref() == Some(label.as_str()) {
        *active = None;
    }

    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|e| e.to_string())?;
    }

    // best effort, webview2 may still hold the folder for a moment on windows
    #[cfg(not(target_os = "macos"))]
    if let Ok(dir) = data_directory(&app, &id) {
        let _ = std::fs::remove_dir_all(dir);
    }

    Ok(())
}

/// answer a permission request shown in the app
///
/// @param id request id from the permission event
/// @param allow whether the permission is granted
#[tauri::command]
pub async fn answer_permission(app: AppHandle, id: u32, allow: bool) -> Result<(), String> {
    // windows prompts natively so nothing waits on the frontend
    #[cfg(target_os = "windows")]
    let _ = (app, id, allow);

    #[cfg(target_os = "linux")]
    linux::answer(&app, id, allow).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    crate::notifications::answer(&app, id, allow).map_err(|e| e.to_string())?;

    Ok(())
}

/// validate an account id coming from the frontend
///
/// @param id account id
///
/// @returns {Uuid} parsed id
fn parse(id: &str) -> Result<Uuid, String> {
    Uuid::parse_str(id).map_err(|_| format!("invalid account id: {id}"))
}

/// webview label for an account
///
/// @param id account id
///
/// @returns {String} label
pub fn label(id: &Uuid) -> String {
    format!("session-{id}")
}

/// folder holding the cookies and storage of an account
///
/// @param app app handle
/// @param id account id
///
/// @returns {PathBuf} data directory
#[cfg(not(target_os = "macos"))]
fn data_directory(app: &AppHandle, id: &Uuid) -> tauri::Result<std::path::PathBuf> {
    Ok(app
        .path()
        .app_local_data_dir()?
        .join("sessions")
        .join(id.to_string()))
}

/// check whether a url belongs to whatsapp
///
/// @param url url to check
///
/// @returns {boolean} true when it stays in the session
fn is_internal(url: &Url) -> bool {
    if !matches!(url.scheme(), "http" | "https") {
        return true;
    }

    url.host_str().is_some_and(|host| {
        DOMAINS
            .iter()
            .any(|domain| host == *domain || host.ends_with(&format!(".{domain}")))
    })
}

/// create the webview for an account
///
/// @param app app handle
/// @param id account id
/// @param bounds initial session area
///
/// @returns {Webview} session webview
fn create(app: &AppHandle, id: &Uuid, bounds: Bounds) -> tauri::Result<Webview> {
    let window = app.get_window(WINDOW).ok_or(tauri::Error::WindowNotFound)?;

    let navigation = app.clone();
    let popup = app.clone();
    let load = app.clone();
    let download = app.clone();

    let builder = WebviewBuilder::new(label(id), WebviewUrl::External(URL.parse().unwrap()))
        .user_agent(USER_AGENT)
        .on_navigation(move |url| {
            if is_internal(url) {
                return true;
            }

            let _ = navigation.opener().open_url(url.as_str(), None::<&str>);
            false
        })
        // links shared in chats open in the default browser
        .on_new_window(move |url, _| {
            if matches!(url.scheme(), "http" | "https") {
                let _ = popup.opener().open_url(url.as_str(), None::<&str>);
            }

            NewWindowResponse::Deny
        })
        .on_page_load(move |webview, payload| {
            let permissions = settings::current(&load).permissions;

            if payload.event() == PageLoadEvent::Finished
                && permissions.notifications == Policy::Allow
            {
                let _ = webview.eval(NOTIFICATIONS);
            }
        })
        .on_download(move |webview, event| match event {
            DownloadEvent::Requested { destination, .. }
                if settings::current(&download).ask_download_location =>
            {
                // cancelling the dialog cancels the download
                match save_dialog(&webview, destination) {
                    Some(path) => {
                        *destination = path;
                        true
                    }
                    None => false,
                }
            }
            _ => true,
        });

    // wkwebview never asks about notifications, so the app takes them over
    #[cfg(target_os = "macos")]
    let builder = builder.initialization_script(crate::notifications::script(app, id));

    // linux answers webkit directly so asking can go through the app
    #[cfg(not(target_os = "linux"))]
    let builder = {
        use tauri::webview::{PermissionKind, PermissionResponse};

        let permission = app.clone();

        builder.on_permission_request(move |_, kind| {
            let permissions = settings::current(&permission).permissions;

            let policy = match kind {
                PermissionKind::Notifications => Permission::Notifications.policy(&permissions),
                PermissionKind::Microphone => Permission::Microphone.policy(&permissions),
                PermissionKind::Camera => Permission::Camera.policy(&permissions),
                _ => return PermissionResponse::Default,
            };

            // default shows the native prompt of the webview
            match policy {
                Policy::Ask => PermissionResponse::Default,
                Policy::Allow => PermissionResponse::Allow,
                Policy::Deny => PermissionResponse::Deny,
            }
        })
    };

    // wkwebview has no data directories, macos 14 keys stores by uuid instead
    #[cfg(target_os = "macos")]
    let builder = builder.data_store_identifier(*id.as_bytes());

    #[cfg(not(target_os = "macos"))]
    let builder = builder.data_directory(data_directory(app, id)?);

    let webview = window.add_child(builder, bounds.position(), bounds.size())?;

    #[cfg(target_os = "linux")]
    linux::adopt(&webview, id)?;

    #[cfg(target_os = "macos")]
    crate::notifications::adopt(&webview, id)?;

    Ok(webview)
}

/// ask where a download should be saved
///
/// @param webview session that started the download
/// @param destination suggested path
///
/// @returns {PathBuf | None} chosen path, none when cancelled
#[allow(unused_variables)]
fn save_dialog(webview: &Webview, destination: &Path) -> Option<std::path::PathBuf> {
    // runs inside the webkit download signal, gtk keeps the app responsive meanwhile
    #[cfg(target_os = "linux")]
    return linux::save_dialog(destination);

    #[cfg(not(target_os = "linux"))]
    {
        let mut dialog = rfd::FileDialog::new()
            .set_title("Save file")
            .set_parent(&webview.window());

        if let Some(folder) = destination.parent() {
            dialog = dialog.set_directory(folder);
        }

        if let Some(name) = destination.file_name() {
            dialog = dialog.set_file_name(name.to_string_lossy());
        }

        dialog.save_file()
    }
}

/// move a session to the given area
///
/// @param app app handle
/// @param webview session webview
/// @param bounds session area
#[allow(unused_variables)]
fn place(app: &AppHandle, webview: &Webview, bounds: Bounds) -> tauri::Result<()> {
    #[cfg(target_os = "linux")]
    return linux::place(app, bounds);

    #[cfg(not(target_os = "linux"))]
    webview.set_bounds(tauri::Rect {
        position: bounds.position(),
        size: bounds.size(),
    })
}

impl Bounds {
    /// top left corner
    ///
    /// @returns {Position} position
    fn position(self) -> tauri::Position {
        LogicalPosition::new(self.x, self.y).into()
    }

    /// width and height
    ///
    /// @returns {Size} size
    fn size(self) -> tauri::Size {
        LogicalSize::new(self.width, self.height).into()
    }
}

/// webkitgtk child webviews are packed into a box and ignore bounds, so the
/// main webview is wrapped in an overlay and sessions are stacked on top of it
#[cfg(target_os = "linux")]
pub mod linux {
    use std::{
        cell::{Cell, RefCell},
        collections::HashMap,
        path::{Path, PathBuf},
    };

    use gtk::{
        gdk::{self, EventMask, WindowEdge, WindowState},
        glib::Propagation,
        prelude::*,
    };
    use tauri::{AppHandle, Emitter, Manager, Runtime, Webview, WebviewWindow};
    use uuid::Uuid;
    use webkit2gtk::{
        CacheModel, NotificationPermissionRequest, PermissionRequest, PermissionRequestExt,
        UserMediaPermissionRequest, UserMediaPermissionRequestExt, WebContextExt, WebViewExt,
    };

    use super::{Bounds, PERMISSION_EVENT, Permission, Prompt, WINDOW};
    use crate::settings::{self, Policy};

    /// thickness of the resize border
    const BORDER: i32 = 5;

    /// size of the resize corners
    const CORNER: i32 = 10;

    /// event asking the frontend to collapse or expand the sidebar
    const SIDEBAR_EVENT: &str = "toggle-sidebar";

    /// resize handles and their cursors, corners first so they win the hit test
    const EDGES: [(WindowEdge, &str); 8] = [
        (WindowEdge::NorthWest, "nw-resize"),
        (WindowEdge::NorthEast, "ne-resize"),
        (WindowEdge::SouthWest, "sw-resize"),
        (WindowEdge::SouthEast, "se-resize"),
        (WindowEdge::North, "n-resize"),
        (WindowEdge::South, "s-resize"),
        (WindowEdge::West, "w-resize"),
        (WindowEdge::East, "e-resize"),
    ];

    thread_local! {
        /// overlay wrapping the main webview, gtk objects live on the main thread
        static OVERLAY: RefCell<Option<gtk::Overlay>> = const { RefCell::new(None) };

        /// area shared by every session as only one is visible at a time
        static AREA: Cell<(i32, i32, i32, i32)> = const { Cell::new((0, 0, 1, 1)) };

        /// resize handles kept above the sessions
        static HANDLES: RefCell<Vec<(gtk::EventBox, WindowEdge)>> = const { RefCell::new(Vec::new()) };

        /// permission requests waiting for the frontend
        static PENDING: RefCell<HashMap<u32, PermissionRequest>> = RefCell::new(HashMap::new());

        /// id of the next permission request
        static NEXT: Cell<u32> = const { Cell::new(0) };
    }

    /// wrap the main webview in an overlay that hosts the sessions
    ///
    /// @param main main webview window
    pub fn install<R: Runtime>(main: &WebviewWindow<R>) -> tauri::Result<()> {
        let app = main.app_handle().clone();

        main.with_webview(move |platform| {
            let webview = platform.inner();

            let Some(parent) = webview
                .parent()
                .and_then(|parent| parent.downcast::<gtk::Container>().ok())
            else {
                return;
            };

            let overlay = gtk::Overlay::new();

            overlay.connect_get_child_position(|overlay, widget| {
                let edge = HANDLES.with_borrow(|handles| {
                    handles
                        .iter()
                        .find(|(handle, _)| handle.upcast_ref::<gtk::Widget>() == widget)
                        .map(|(_, edge)| *edge)
                });

                if let Some(edge) = edge {
                    let allocation = overlay.allocation();

                    return Some(handle_area(edge, allocation.width(), allocation.height()));
                }

                // sessions take whatever area the frontend last reported
                let (x, y, width, height) = AREA.get();

                Some(gtk::Rectangle::new(x, y, width, height))
            });

            parent.remove(&webview);
            overlay.add(&webview);

            match parent.clone().downcast::<gtk::Box>() {
                Ok(vbox) => vbox.pack_start(&overlay, true, true, 0),
                Err(_) => parent.add(&overlay),
            }

            overlay.show();

            if let Some(window) = webview
                .toplevel()
                .and_then(|window| window.downcast::<gtk::Window>().ok())
            {
                install_handles(&overlay, &window);
                install_shortcuts(&window, app);
            }

            OVERLAY.set(Some(overlay));
        })
    }

    /// move a freshly created session from the window box into the overlay
    ///
    /// @param session session webview
    /// @param id account id
    pub fn adopt<R: Runtime>(session: &Webview<R>, id: &Uuid) -> tauri::Result<()> {
        let app = session.app_handle().clone();
        let account = id.to_string();

        session.with_webview(move |platform| {
            let webview = platform.inner();

            // runs after wry, which leaves every request unhandled
            webview.connect_permission_request(move |_, request| {
                request_permission(&app, &account, request)
            });

            // keep less decoded content around, whatsapp is a single page
            // and never goes back or forward
            if let Some(context) = webview.context() {
                context.set_cache_model(CacheModel::DocumentViewer);
            }

            OVERLAY.with_borrow(|overlay| {
                let Some(overlay) = overlay else { return };

                if let Some(parent) = webview
                    .parent()
                    .and_then(|parent| parent.downcast::<gtk::Container>().ok())
                {
                    parent.remove(&webview);
                }

                overlay.add_overlay(&webview);

                // children are stacked in order on every allocation
                HANDLES.with_borrow(|handles| {
                    for (handle, _) in handles {
                        overlay.reorder_overlay(handle, -1);
                    }
                });

                overlay.queue_resize();
            });
        })
    }

    /// update the session area and relayout the overlay
    ///
    /// @param app app handle
    /// @param bounds session area
    pub fn place(app: &AppHandle, bounds: Bounds) -> tauri::Result<()> {
        let area = (
            bounds.x.round() as i32,
            bounds.y.round() as i32,
            bounds.width.round().max(1.0) as i32,
            bounds.height.round().max(1.0) as i32,
        );

        app.run_on_main_thread(move || {
            AREA.set(area);
            OVERLAY.with_borrow(|overlay| {
                if let Some(overlay) = overlay {
                    overlay.queue_resize();
                }
            });
        })
    }

    /// answer a request held for the frontend
    ///
    /// @param app app handle
    /// @param id request id
    /// @param allow whether the permission is granted
    pub fn answer(app: &AppHandle, id: u32, allow: bool) -> tauri::Result<()> {
        app.run_on_main_thread(move || {
            let Some(request) = PENDING.with_borrow_mut(|pending| pending.remove(&id)) else {
                return;
            };

            if allow {
                request.allow();
            } else {
                request.deny();
            }
        })
    }

    /// ask where a download should be saved
    ///
    /// @param destination suggested path
    ///
    /// @returns {PathBuf | None} chosen path, none when cancelled
    pub fn save_dialog(destination: &Path) -> Option<PathBuf> {
        let parent = OVERLAY
            .with_borrow(|overlay| overlay.as_ref()?.toplevel()?.downcast::<gtk::Window>().ok());

        let dialog = gtk::FileChooserNative::new(
            Some("Save file"),
            parent.as_ref(),
            gtk::FileChooserAction::Save,
            Some("Save"),
            Some("Cancel"),
        );

        dialog.set_do_overwrite_confirmation(true);

        if let Some(folder) = destination.parent() {
            dialog.set_current_folder(folder);
        }

        if let Some(name) = destination.file_name() {
            dialog.set_current_name(&name.to_string_lossy());
        }

        let accepted = dialog.run() == gtk::ResponseType::Accept;

        accepted.then(|| dialog.filename()).flatten()
    }

    /// apply the permission settings to a webkit request
    ///
    /// @param app app handle
    /// @param account account id
    /// @param request webkit request
    ///
    /// @returns {boolean} true when the request was taken care of
    fn request_permission<R: Runtime>(
        app: &AppHandle<R>,
        account: &str,
        request: &PermissionRequest,
    ) -> bool {
        let mut permissions = Vec::new();

        if let Some(media) = request.downcast_ref::<UserMediaPermissionRequest>() {
            if media.is_for_audio_device() {
                permissions.push(Permission::Microphone);
            }

            if media.is_for_video_device() {
                permissions.push(Permission::Camera);
            }
        } else if request.is::<NotificationPermissionRequest>() {
            permissions.push(Permission::Notifications);
        }

        // screen sharing, location and anything else whatsapp doesn't need
        if permissions.is_empty() {
            request.deny();
            return true;
        }

        let settings = settings::current(app).permissions;
        let policies = permissions
            .iter()
            .map(|permission| permission.policy(&settings));

        if policies.clone().any(|policy| policy == Policy::Deny) {
            request.deny();
            return true;
        }

        if policies.clone().all(|policy| policy == Policy::Allow) {
            request.allow();
            return true;
        }

        // only ask about what isn't allowed already
        let permissions = permissions
            .into_iter()
            .filter(|permission| permission.policy(&settings) == Policy::Ask)
            .collect();

        let id = NEXT.get();
        NEXT.set(id.wrapping_add(1));

        let prompt = Prompt {
            id,
            account: account.to_owned(),
            permissions,
        };

        // only the app webview may learn about other accounts
        if app.emit_to(WINDOW, PERMISSION_EVENT, prompt).is_err() {
            request.deny();
            return true;
        }

        PENDING.with_borrow_mut(|pending| pending.insert(id, request.clone()));

        true
    }

    /// area of a resize handle inside the window
    ///
    /// @param edge handle edge
    /// @param width window width
    /// @param height window height
    ///
    /// @returns {Rectangle} handle area
    fn handle_area(edge: WindowEdge, width: i32, height: i32) -> gtk::Rectangle {
        let (x, y, w, h) = match edge {
            WindowEdge::NorthWest => (0, 0, CORNER, CORNER),
            WindowEdge::NorthEast => (width - CORNER, 0, CORNER, CORNER),
            WindowEdge::SouthWest => (0, height - CORNER, CORNER, CORNER),
            WindowEdge::SouthEast => (width - CORNER, height - CORNER, CORNER, CORNER),
            WindowEdge::North => (CORNER, 0, width - 2 * CORNER, BORDER),
            WindowEdge::South => (CORNER, height - BORDER, width - 2 * CORNER, BORDER),
            WindowEdge::West => (0, CORNER, BORDER, height - 2 * CORNER),
            _ => (width - BORDER, CORNER, BORDER, height - 2 * CORNER),
        };

        gtk::Rectangle::new(x, y, w.max(1), h.max(1))
    }

    /// add resize handles above every webview
    ///
    /// tauri only attaches its resize handling to the main webview and hit tests
    /// with root coordinates, which drift once the window moves
    ///
    /// @param overlay session overlay
    /// @param window toplevel window
    fn install_handles(overlay: &gtk::Overlay, window: &gtk::Window) {
        for (edge, cursor) in EDGES {
            let handle = gtk::EventBox::new();

            handle.set_visible_window(false);
            handle.add_events(EventMask::BUTTON_PRESS_MASK | EventMask::ENTER_NOTIFY_MASK);

            handle.connect_enter_notify_event(move |_, event| {
                if let Some(window) = event.window() {
                    window.set_cursor(gdk::Cursor::from_name(&window.display(), cursor).as_ref());
                }

                Propagation::Proceed
            });

            handle.connect_button_press_event(move |handle, event| {
                let Some(window) = handle
                    .toplevel()
                    .and_then(|window| window.downcast::<gtk::Window>().ok())
                else {
                    return Propagation::Proceed;
                };

                if event.button() != 1 {
                    return Propagation::Proceed;
                }

                let (x, y) = event.root();
                window.begin_resize_drag(edge, 1, x as i32, y as i32, event.time());

                Propagation::Stop
            });

            overlay.add_overlay(&handle);
            HANDLES.with_borrow_mut(|handles| handles.push((handle, edge)));
        }

        sync_handles(window, window.window().map(|gdk| gdk.state()));

        window.connect_window_state_event(|window, event| {
            sync_handles(window, Some(event.new_window_state()));

            Propagation::Proceed
        });
    }

    /// show the resize handles only while the window can be resized
    ///
    /// @param window toplevel window
    /// @param state current window state
    fn sync_handles(window: &gtk::Window, state: Option<WindowState>) {
        let fixed = state.is_some_and(|state| {
            state.intersects(WindowState::MAXIMIZED | WindowState::FULLSCREEN)
        });
        let visible = window.is_resizable() && !fixed;

        HANDLES.with_borrow(|handles| {
            for (handle, _) in handles {
                handle.set_visible(visible);
            }
        });
    }

    /// app shortcuts, the window catches keys before either webview does
    ///
    /// ctrl q quits and ctrl shift s toggles the sidebar
    ///
    /// @param window toplevel window
    /// @param app app handle
    fn install_shortcuts<R: Runtime>(window: &gtk::Window, app: AppHandle<R>) {
        window.connect_key_press_event(move |_, event| {
            let state = event.state();
            let control = state.contains(gdk::ModifierType::CONTROL_MASK);
            let shift = state.contains(gdk::ModifierType::SHIFT_MASK);
            let key = event.keyval().to_lower();

            if control && !shift && key == gdk::keys::constants::q {
                app.exit(0);
                return Propagation::Stop;
            }

            if control && shift && key == gdk::keys::constants::s {
                let _ = app.emit_to(WINDOW, SIDEBAR_EVENT, ());
                return Propagation::Stop;
            }

            Propagation::Proceed
        });
    }
}
