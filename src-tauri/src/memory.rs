//! memory limits of the web processes on linux
//!
//! webkit only frees caches and collects garbage once a web process uses a
//! third of 3 GB, so every whatsapp session grew towards a gigabyte before
//! anything was given back. the limit is a construct only property of the web
//! context, which tauri creates, so new contexts are given it as they are built

use std::sync::OnceLock;

use gtk::glib::{gobject_ffi, prelude::*, translate::ToGlibPtrMut};
use webkit2gtk::MemoryPressureSettings;

/// memory a web process is expected to stay under, in mib
const LIMIT: u32 = 1536;

/// share of the limit past which caches are dropped and garbage is collected
const CONSERVATIVE: f64 = 0.3;

/// share of the limit past which everything that can be freed is
const STRICT: f64 = 0.6;

/// how often each web process checks its memory, in seconds
const INTERVAL: f64 = 30.0;

/// property of the web context holding the settings
const PROPERTY: &std::ffi::CStr = c"memory-pressure-settings";

/// how web contexts were finished before the limits were added
static CONSTRUCTED: OnceLock<unsafe extern "C" fn(*mut gobject_ffi::GObject)> = OnceLock::new();

/// plugin giving every web context created from now on the memory limits
///
/// runs once gtk is up and before the main window and its context exist
///
/// @returns {TauriPlugin} plugin
pub fn plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("memory")
        .setup(|_, _| {
            install();
            Ok(())
        })
        .build()
}

/// wrap the constructed handler of the web context class
fn install() {
    // safety: the class stays referenced for the life of the app and is only
    // touched on the main thread, before any context is created
    unsafe {
        let class = gobject_ffi::g_type_class_ref(webkit2gtk::ffi::webkit_web_context_get_type())
            .cast::<gobject_ffi::GObjectClass>();

        if let Some(original) = (*class).constructed
            && CONSTRUCTED.set(original).is_ok()
        {
            (*class).constructed = Some(constructed);
        }
    }
}

/// limits handed to every web process
///
/// @returns {MemoryPressureSettings} settings
fn settings() -> MemoryPressureSettings {
    let mut settings = MemoryPressureSettings::new();

    settings.set_memory_limit(LIMIT);
    settings.set_conservative_threshold(CONSERVATIVE);
    settings.set_strict_threshold(STRICT);
    settings.set_poll_interval(INTERVAL);

    settings
}

/// set the limits on a new web context, then let webkit finish building it
///
/// construct only properties are set through the class, which is what
/// g_object_new does with them too
///
/// @param object web context being built
unsafe extern "C" fn constructed(object: *mut gobject_ffi::GObject) {
    // safety: gobject hands out a live web context, whose class declares the property
    unsafe {
        let class = (*object)
            .g_type_instance
            .g_class
            .cast::<gobject_ffi::GObjectClass>();
        let spec = gobject_ffi::g_object_class_find_property(class, PROPERTY.as_ptr());

        if !spec.is_null()
            && let Some(set_property) = (*class).set_property
        {
            let mut value = settings().to_value();
            set_property(object, (*spec).param_id, value.to_glib_none_mut().0, spec);
        }

        if let Some(original) = CONSTRUCTED.get() {
            original(object);
        }
    }
}
