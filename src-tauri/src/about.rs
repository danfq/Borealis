//! native macos about panel
//!
//! the stock tauri about item only takes plain text credits, so the panel is
//! opened directly to get a clickable website link

use objc2::{MainThreadMarker, rc::Retained, runtime::AnyObject};
use objc2_app_kit::{
    NSAboutPanelOptionApplicationName, NSAboutPanelOptionApplicationVersion,
    NSAboutPanelOptionCredits, NSApplication, NSColor, NSFont, NSFontAttributeName,
    NSForegroundColorAttributeName, NSLinkAttributeName, NSMutableParagraphStyle,
    NSParagraphStyleAttributeName, NSTextAlignment,
};
use objc2_foundation::{
    NSAttributedString, NSDictionary, NSMutableAttributedString, NSString, NSURL, ns_string,
};

/// author shown in the credits
const AUTHOR: &str = "DanFQ";

/// app website linked from the credits
const WEBSITE: &str = "https://getborealis.app";

/// show the about panel
///
/// @param mtm main thread marker
/// @param name app name
/// @param version app version
/// @param copyright copyright line, if any
pub fn show(mtm: MainThreadMarker, name: &str, version: &str, copyright: Option<&str>) {
    let mut keys = vec![
        unsafe { NSAboutPanelOptionApplicationName },
        unsafe { NSAboutPanelOptionApplicationVersion },
        unsafe { NSAboutPanelOptionCredits },
    ];
    let mut values: Vec<Retained<AnyObject>> = vec![
        NSString::from_str(name).into(),
        NSString::from_str(version).into(),
        credits().into(),
    ];

    if let Some(copyright) = copyright {
        keys.push(ns_string!("Copyright"));
        values.push(NSString::from_str(copyright).into());
    }

    let options = NSDictionary::from_retained_objects(&keys, &values);

    unsafe {
        NSApplication::sharedApplication(mtm).orderFrontStandardAboutPanelWithOptions(&options)
    };
}

/// centered credits with the author and a website link
///
/// @returns {NSAttributedString} styled credits
fn credits() -> Retained<NSAttributedString> {
    let style = NSMutableParagraphStyle::new();
    style.setAlignment(NSTextAlignment::Center);

    let font = NSFont::systemFontOfSize(NSFont::smallSystemFontSize());
    let color = NSColor::secondaryLabelColor();
    let base: [&AnyObject; 3] = [&font, &style, &color];
    let base_keys = unsafe {
        [
            NSFontAttributeName,
            NSParagraphStyleAttributeName,
            NSForegroundColorAttributeName,
        ]
    };

    let text = NSMutableAttributedString::new();

    // author line
    let author = NSDictionary::from_slices(&base_keys, &base);
    let line = unsafe {
        NSAttributedString::new_with_attributes(
            &NSString::from_str(&format!("Made by {AUTHOR}\n")),
            &author,
        )
    };
    text.appendAttributedString(&line);

    // website link, label drops the scheme
    if let Some(url) = NSURL::URLWithString(&NSString::from_str(WEBSITE)) {
        let label = WEBSITE.trim_start_matches("https://");
        let keys = unsafe {
            [
                NSFontAttributeName,
                NSParagraphStyleAttributeName,
                NSLinkAttributeName,
            ]
        };
        let link = NSDictionary::from_slices(&keys, &[&*font as &AnyObject, &style, &url]);

        let line =
            unsafe { NSAttributedString::new_with_attributes(&NSString::from_str(label), &link) };
        text.appendAttributedString(&line);
    }

    text.into_super()
}
