//! app shortcuts on macos
//!
//! a focused session gets every key before the app webview does, so shortcuts
//! are picked out of the event stream before any webview sees them

use std::ptr::NonNull;

use block2::RcBlock;
use objc2_app_kit::{NSEvent, NSEventMask, NSEventModifierFlags};
use tauri::{AppHandle, Emitter};

use crate::{
    session::WINDOW,
    settings::{self, Rail},
};

/// event asking the frontend to collapse or expand the sidebar
const SIDEBAR_EVENT: &str = "toggle-sidebar";

/// event asking the frontend to open the account at an index
const SWITCH_EVENT: &str = "switch-account";

/// catch cmd 1 to 9 to switch accounts and cmd shift s to toggle the sidebar
///
/// @param app app handle
pub fn install(app: &AppHandle) {
    let app = app.clone();

    let handler = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
        // safety: appkit hands out a live event
        if handle(&app, unsafe { event.as_ref() }) {
            std::ptr::null_mut()
        } else {
            event.as_ptr()
        }
    });

    let monitor = unsafe {
        NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::KeyDown, &handler)
    };

    // the monitor lives as long as the app
    std::mem::forget(monitor);
}

/// run the shortcut matching a key press
///
/// @param app app handle
/// @param event key down event
///
/// @returns {boolean} true when the event was used, nothing else sees it then
fn handle(app: &AppHandle, event: &NSEvent) -> bool {
    // caps lock and the like don't count
    let flags = event.modifierFlags()
        & (NSEventModifierFlags::Shift
            | NSEventModifierFlags::Control
            | NSEventModifierFlags::Option
            | NSEventModifierFlags::Command);

    let Some(key) = event.charactersIgnoringModifiers() else {
        return false;
    };
    let key = key.to_string().to_lowercase();

    if flags == NSEventModifierFlags::Command
        && let Some(digit) = key
            .parse::<u8>()
            .ok()
            .filter(|digit| (1..=9).contains(digit))
    {
        let _ = app.emit_to(WINDOW, SWITCH_EVENT, digit - 1);
        return true;
    }

    // the topbar can't collapse, so the key goes to the page instead
    if flags == NSEventModifierFlags::Command | NSEventModifierFlags::Shift
        && key == "s"
        && settings::current(app).rail == Rail::Sidebar
    {
        let _ = app.emit_to(WINDOW, SIDEBAR_EVENT, ());
        return true;
    }

    false
}
