//! notifications for the sessions on macos
//!
//! wkwebview denies the notification permission without asking and can't show
//! notifications for third party apps, so every session gets a replacement of
//! the notification api that asks through the app and shows them natively

use std::{
    cell::{Cell, RefCell},
    collections::{BTreeSet, HashMap},
    sync::Mutex,
};

use block2::{Block, RcBlock};
use objc2::{
    AnyThread, DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send,
    rc::Retained,
    runtime::{AnyClass, AnyObject, Bool, NSObject, NSObjectProtocol, ProtocolObject},
};
use objc2_foundation::{NSArray, NSBundle, NSDictionary, NSString, NSUInteger, ns_string};
use objc2_web_kit::{
    WKContentWorld, WKScriptMessage, WKScriptMessageHandlerWithReply, WKUserContentController,
};
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, Webview};
use uuid::Uuid;

use crate::{
    session::{self, PERMISSION_EVENT, Permission, Prompt, WINDOW},
    settings::{self, Policy},
};

/// replacement of the notification api, a function taking the initial permission
const SHIM: &str = include_str!("notifications.js");

/// message handler the shim talks to
const HANDLER: &str = "borealis";

/// event the shim listens to for clicks
const CLICK_EVENT: &str = "borealis-notification-click";

/// event asking the frontend to open an account
const OPEN_EVENT: &str = "open-account";

/// only whatsapp itself may talk to the app
const HOST: &str = "web.whatsapp.com";

/// alert and sound
const AUTHORIZATION: NSUInteger = (1 << 1) | (1 << 2);

/// sound, list and banner, notifications show while the app is focused too
/// since whatsapp only sends them when its own account isn't on screen
const PRESENTATION: NSUInteger = (1 << 1) | (1 << 3) | (1 << 4);

/// reply handler of a script message
type Reply = Block<dyn Fn(*mut AnyObject, *mut NSString)>;

/// permission request waiting for the frontend
struct Pending {
    account: String,
    reply: RcBlock<dyn Fn(*mut AnyObject, *mut NSString)>,
}

#[link(name = "UserNotifications", kind = "framework")]
unsafe extern "C" {}

/// accounts allowed to notify until the app quits, while set to ask
static GRANTED: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());

thread_local! {
    /// permission requests waiting for the frontend
    static PENDING: RefCell<HashMap<u32, Pending>> = RefCell::new(HashMap::new());

    /// id of the next permission request
    static NEXT: Cell<u32> = const { Cell::new(0) };
}

/// messages sent by the shim
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum Message {
    State,
    Request,
    Show {
        id: String,
        title: String,
        body: String,
        tag: String,
        silent: bool,
    },
    Close {
        id: String,
        tag: String,
    },
}

/// state shared by the message handler of a session
struct HandlerIvars {
    app: AppHandle,
    account: String,
}

define_class!(
    /// receives messages from the shim of a session
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "BorealisNotificationHandler"]
    #[ivars = HandlerIvars]
    struct Handler;

    unsafe impl NSObjectProtocol for Handler {}

    unsafe impl WKScriptMessageHandlerWithReply for Handler {
        #[unsafe(method(userContentController:didReceiveScriptMessage:replyHandler:))]
        fn did_receive(
            &self,
            _controller: &WKUserContentController,
            message: &WKScriptMessage,
            reply: &Reply,
        ) {
            self.receive(message, reply);
        }
    }
);

impl Handler {
    /// create a handler for an account
    ///
    /// @param mtm main thread marker
    /// @param app app handle
    /// @param account account id
    ///
    /// @returns {Handler} handler
    fn new(mtm: MainThreadMarker, app: AppHandle, account: String) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(HandlerIvars { app, account });

        unsafe { msg_send![super(this), init] }
    }

    /// answer a message from the shim
    ///
    /// @param message script message
    /// @param reply reply handler, resolves the promise of the shim
    fn receive(&self, message: &WKScriptMessage, reply: &Reply) {
        let HandlerIvars { app, account } = self.ivars();

        let frame = unsafe { message.frameInfo() };
        let host = unsafe { frame.securityOrigin().host() };

        if !unsafe { frame.isMainFrame() } || host.to_string() != HOST {
            return reject(reply, "not allowed");
        }

        let message = unsafe { message.body() }
            .downcast::<NSString>()
            .ok()
            .and_then(|body| serde_json::from_str::<Message>(&body.to_string()).ok());

        let Some(message) = message else {
            return reject(reply, "invalid message");
        };

        match message {
            Message::State => resolve(reply, Some(state(app, account))),
            Message::Request => request(app, account, reply),
            Message::Show {
                id,
                title,
                body,
                tag,
                silent,
            } => {
                if state(app, account) != "granted" {
                    return reject(reply, "not allowed");
                }

                if !bundled() {
                    return reject(reply, "notifications need the bundled app");
                }

                show(account, &id, &title, &body, &tag, silent);
                resolve(reply, None);
            }
            Message::Close { id, tag } => {
                remove(account, &id, &tag);
                resolve(reply, None);
            }
        }
    }
}

define_class!(
    /// reacts to notifications being shown and clicked
    #[unsafe(super(NSObject))]
    #[name = "BorealisNotificationDelegate"]
    #[ivars = AppHandle]
    struct Delegate;

    unsafe impl NSObjectProtocol for Delegate {}

    impl Delegate {
        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        fn will_present(
            &self,
            _center: &AnyObject,
            _notification: &AnyObject,
            handler: &Block<dyn Fn(NSUInteger)>,
        ) {
            handler.call((PRESENTATION,));
        }

        #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
        fn did_receive(
            &self,
            _center: &AnyObject,
            response: &AnyObject,
            handler: &Block<dyn Fn()>,
        ) {
            open(self.ivars(), response);
            handler.call(());
        }
    }
);

/// listen to notification clicks
///
/// @param app app handle
pub fn install(app: &AppHandle) {
    let Some(center) = center() else { return };

    let delegate = Delegate::alloc().set_ivars(app.clone());
    let delegate: Retained<Delegate> = unsafe { msg_send![super(delegate), init] };

    unsafe {
        let _: () = msg_send![&center, setDelegate: &*delegate];
    }

    // the center only keeps a weak reference and the delegate lives as long as the app
    std::mem::forget(delegate);
}

/// script replacing the notification api of a session
///
/// @param app app handle
/// @param id account id
///
/// @returns {String} script
pub fn script(app: &AppHandle, id: &Uuid) -> String {
    let permission = state(app, &id.to_string());

    // the file holds a bare function so formatters leave it alone
    let shim = SHIM.trim_end().trim_end_matches(';');

    format!("({shim})({permission:?});")
}

/// let the shim of a session talk to the app
///
/// @param webview session webview
/// @param id account id
pub fn adopt(webview: &Webview, id: &Uuid) -> tauri::Result<()> {
    let app = webview.app_handle().clone();
    let account = id.to_string();

    webview.with_webview(move |platform| {
        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };

        // safety: wry hands out the controller of a live webview
        let controller = unsafe { &*platform.controller().cast::<WKUserContentController>() };
        let handler = Handler::new(mtm, app, account);

        unsafe {
            controller.addScriptMessageHandlerWithReply_contentWorld_name(
                ProtocolObject::from_ref(&*handler),
                &WKContentWorld::pageWorld(mtm),
                &NSString::from_str(HANDLER),
            );
        }
    })
}

/// answer a request held for the frontend
///
/// @param app app handle
/// @param id request id
/// @param allow whether the permission is granted
pub fn answer(app: &AppHandle, id: u32, allow: bool) -> tauri::Result<()> {
    app.run_on_main_thread(move || {
        let Some(Pending { account, reply }) =
            PENDING.with_borrow_mut(|pending| pending.remove(&id))
        else {
            return;
        };

        if allow {
            GRANTED.lock().unwrap().insert(account);
            authorize(|| {});
        }

        resolve(&reply, Some(if allow { "granted" } else { "denied" }));
    })
}

/// permission the shim should report
///
/// @param app app handle
/// @param account account id
///
/// @returns {string} web notification permission
fn state(app: &AppHandle, account: &str) -> &'static str {
    match settings::current(app).permissions.notifications {
        Policy::Allow => "granted",
        Policy::Deny => "denied",
        Policy::Ask if GRANTED.lock().unwrap().contains(account) => "granted",
        Policy::Ask => "default",
    }
}

/// answer a permission request from the settings or ask the frontend
///
/// @param app app handle
/// @param account account id
/// @param reply reply handler
fn request(app: &AppHandle, account: &str, reply: &Reply) {
    let current = state(app, account);

    if current != "default" {
        if current == "granted" {
            authorize(|| {});
        }

        return resolve(reply, Some(current));
    }

    let id = NEXT.get();
    NEXT.set(id.wrapping_add(1));

    let prompt = Prompt {
        id,
        account: account.to_owned(),
        permissions: vec![Permission::Notifications],
    };

    // only the app webview may learn about other accounts
    if app.emit_to(WINDOW, PERMISSION_EVENT, prompt).is_err() {
        return resolve(reply, Some("denied"));
    }

    let entry = Pending {
        account: account.to_owned(),
        reply: reply.copy(),
    };

    PENDING.with_borrow_mut(|pending| pending.insert(id, entry));
}

/// resolve the promise of the shim
///
/// @param reply reply handler
/// @param value resolved value, undefined when none
fn resolve(reply: &Reply, value: Option<&str>) {
    let value = value.map(NSString::from_str);
    let value = value.as_ref().map_or(std::ptr::null_mut(), |value| {
        Retained::as_ptr(value).cast_mut().cast()
    });

    reply.call((value, std::ptr::null_mut()));
}

/// reject the promise of the shim
///
/// @param reply reply handler
/// @param error error message
fn reject(reply: &Reply, error: &str) {
    let error = NSString::from_str(error);

    reply.call((std::ptr::null_mut(), Retained::as_ptr(&error).cast_mut()));
}

/// check whether the app runs from a bundle, the notification center aborts
/// the app otherwise, as happens while developing
///
/// @returns {boolean} true when bundled
fn bundled() -> bool {
    NSBundle::mainBundle()
        .bundlePath()
        .to_string()
        .ends_with(".app")
}

/// shared notification center
///
/// @returns {AnyObject | None} center, none outside of a bundle
fn center() -> Option<Retained<AnyObject>> {
    if !bundled() {
        return None;
    }

    let class = AnyClass::get(c"UNUserNotificationCenter")?;

    unsafe { msg_send![class, currentNotificationCenter] }
}

/// ask macos to allow notifications, only prompts the first time
///
/// @param then runs once notifications are allowed
fn authorize(then: impl Fn() + 'static) {
    let Some(center) = center() else { return };

    let completion = RcBlock::new(move |granted: Bool, _error: *mut AnyObject| {
        if granted.as_bool() {
            then();
        }
    });

    unsafe {
        let _: () = msg_send![
            &center,
            requestAuthorizationWithOptions: AUTHORIZATION,
            completionHandler: &*completion
        ];
    }
}

/// identifier of a notification, notifications sharing a tag replace each other
///
/// @param account account id
/// @param id notification id
/// @param tag notification tag
///
/// @returns {String} identifier
fn identifier(account: &str, id: &str, tag: &str) -> String {
    format!("{account}:{}", if tag.is_empty() { id } else { tag })
}

/// show a notification
///
/// @param account account id
/// @param id notification id
/// @param title notification title
/// @param body notification body
/// @param tag notification tag
/// @param silent whether to skip the sound
fn show(account: &str, id: &str, title: &str, body: &str, tag: &str, silent: bool) {
    let (Some(content), Some(request), Some(sound)) = (
        AnyClass::get(c"UNMutableNotificationContent"),
        AnyClass::get(c"UNNotificationRequest"),
        AnyClass::get(c"UNNotificationSound"),
    ) else {
        return;
    };

    // clicks find the session and the notification from here
    let info = NSDictionary::from_retained_objects(
        &[ns_string!("account"), ns_string!("id")],
        &[NSString::from_str(account), NSString::from_str(id)],
    );

    let request: Retained<AnyObject> = unsafe {
        let content: Retained<AnyObject> = msg_send![content, new];

        let _: () = msg_send![&content, setTitle: &*NSString::from_str(title)];
        let _: () = msg_send![&content, setBody: &*NSString::from_str(body)];
        let _: () = msg_send![&content, setUserInfo: &*info];

        // groups notifications per account
        let _: () = msg_send![&content, setThreadIdentifier: &*NSString::from_str(account)];

        if !silent {
            let sound: Retained<AnyObject> = msg_send![sound, defaultSound];
            let _: () = msg_send![&content, setSound: &*sound];
        }

        msg_send![
            request,
            requestWithIdentifier: &*NSString::from_str(&identifier(account, id, tag)),
            content: &*content,
            trigger: None::<&AnyObject>
        ]
    };

    authorize(move || {
        let Some(center) = center() else { return };

        unsafe {
            let _: () = msg_send![
                &center,
                addNotificationRequest: &*request,
                withCompletionHandler: None::<&Block<dyn Fn(*mut AnyObject)>>
            ];
        }
    });
}

/// remove a notification from the notification center
///
/// @param account account id
/// @param id notification id
/// @param tag notification tag
fn remove(account: &str, id: &str, tag: &str) {
    let Some(center) = center() else { return };

    let identifiers =
        NSArray::from_retained_slice(&[NSString::from_str(&identifier(account, id, tag))]);

    unsafe {
        let _: () = msg_send![&center, removeDeliveredNotificationsWithIdentifiers: &*identifiers];
    }
}

/// bring up the account of a clicked notification and let whatsapp open the chat
///
/// @param app app handle
/// @param response notification response
fn open(app: &AppHandle, response: &AnyObject) {
    let info: Retained<NSDictionary<NSString, AnyObject>> = unsafe {
        let notification: Retained<AnyObject> = msg_send![response, notification];
        let request: Retained<AnyObject> = msg_send![&notification, request];
        let content: Retained<AnyObject> = msg_send![&request, content];

        msg_send![&content, userInfo]
    };

    let value = |key: &NSString| {
        info.objectForKey(key)
            .and_then(|value| value.downcast::<NSString>().ok())
            .map(|value| value.to_string())
    };

    let (Some(account), Some(id)) = (value(ns_string!("account")), value(ns_string!("id"))) else {
        return;
    };

    let Ok(account) = Uuid::parse_str(&account) else {
        return;
    };

    let _ = app.show();

    if let Some(window) = app.get_window(WINDOW) {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }

    let _ = app.emit_to(WINDOW, OPEN_EVENT, account.to_string());

    if let Some(webview) = app.get_webview(&session::label(&account)) {
        let detail = serde_json::to_string(&id).unwrap_or_default();

        let _ = webview.eval(format!(
            "window.dispatchEvent(new CustomEvent({CLICK_EVENT:?}, {{ detail: {detail} }}));"
        ));
    }
}
