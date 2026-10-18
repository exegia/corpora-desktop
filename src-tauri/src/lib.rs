mod autostart;
mod tray;

use std::sync::atomic::{AtomicBool, Ordering};
use std::{thread, time::Duration};
use tauri::{AppHandle, Manager, WindowEvent, window::Color};
use tauri_plugin_store::StoreExt;

#[tauri::command]
fn desktop_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// CLI flag the autostart entry launches us with on Windows/Linux, so we
/// can tell a login launch from a normal one. macOS login items can't pass
/// arguments, so there we detect it via `NSApplication.isHidden` instead
/// (see `launched_hidden`).
#[cfg_attr(target_os = "macos", allow(dead_code))]
const AUTOSTART_FLAG: &str = "--autostart";

/// Store file + key that the frontend persists app settings under. We read
/// a couple of fields from here at startup (see `read_bool_setting`).
const SETTINGS_STORE: &str = "settings.json";
const SETTINGS_KEY: &str = "settings";
const TRAY_ID: &str = "main-tray";

/// If the frontend never signals readiness (e.g. a fatal JS error), show
/// the window anyway after this long so it can't stay stuck hidden.
const READY_FALLBACK: Duration = Duration::from_secs(5);

/// Whether the tray/menu-bar icon is currently present. Drives what closing
/// the window does: hide to the tray while it's there, quit otherwise.
struct TrayVisible(AtomicBool);

/// Whether this launch should stay hidden in the menu bar (a "start
/// minimized" login launch). Read by `frontend_ready` so the reveal is
/// suppressed.
struct StayHidden(bool);

/// Read a boolean field out of the persisted settings blob, falling back to
/// `default` when the store, the settings object, or the field is missing.
fn read_bool_setting(app: &AppHandle, key: &str, default: bool) -> bool {
    app.store(SETTINGS_STORE)
        .ok()
        .and_then(|store| store.get(SETTINGS_KEY))
        .and_then(|settings| settings.get(key).and_then(|v| v.as_bool()))
        .unwrap_or(default)
}

/// Show + focus the main window (used by the tray "Open" item and at
/// normal launch). On macOS this also restores the Dock icon.
pub fn show_main_window(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Hide the main window. On macOS we switch to the Accessory activation
/// policy so the app drops out of the Dock and behaves as a pure menu-bar
/// app while hidden.
pub fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }

    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
}

/// Add or remove the tray icon at runtime, keeping `TrayVisible` in sync.
/// Called from the "Show in menu bar" setting.
fn set_tray_visible(app: &AppHandle, visible: bool) -> tauri::Result<()> {
    let state = app.state::<TrayVisible>();
    let currently = state.0.load(Ordering::SeqCst);
    if visible == currently {
        return Ok(());
    }

    if visible {
        tray::create_tray(app)?;
    } else {
        app.remove_tray_by_id(TRAY_ID);
        // Without a tray there's no menu bar to live in, so make sure the
        // app is a normal Dock app rather than stuck as an Accessory.
        #[cfg(target_os = "macos")]
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    }
    state.0.store(visible, Ordering::SeqCst);
    Ok(())
}

/// Was this process launched hidden as a login item? macOS marks a
/// "hidden" login item's app as hidden at launch, which we read from
/// `NSApplication.isHidden`. On Windows/Linux the login entry launches us
/// with `AUTOSTART_FLAG`, and "start minimized" is read from settings.
fn launched_hidden(app: &AppHandle) -> bool {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        use objc2::MainThreadMarker;
        use objc2_app_kit::NSApplication;
        // setup() runs on the main thread, so the marker is available.
        MainThreadMarker::new().is_some_and(|mtm| NSApplication::sharedApplication(mtm).isHidden())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let at_login = std::env::args().any(|arg| arg == AUTOSTART_FLAG);
        at_login && read_bool_setting(app, "startMinimized", false)
    }
}

/// Called by the frontend once the loading screen has painted its first
/// frame. Revealing the window only now — rather than eagerly in setup()
/// — means the webview already has themed content on screen, so there is
/// no white flash of the webview's default background. The window is kept
/// hidden when this was a "start minimized" login launch.
///
/// `theme` ("light" | "dark") paints a matching native window background
/// as extra insurance during the show transition.
#[tauri::command]
fn frontend_ready(app: AppHandle, theme: String) {
    if app.state::<StayHidden>().0 {
        return;
    }

    if let Some(window) = app.get_webview_window("main") {
        let color = match theme.as_str() {
            "light" => Color(242, 242, 242, 255), // --color-bg-base (light)
            _ => Color(17, 17, 17, 255),          // --color-bg-base (dark)
        };
        let _ = window.set_background_color(Some(color));
    }

    show_main_window(&app);
}

/// Show or hide the tray/menu-bar icon (the "Show in menu bar" setting).
#[tauri::command]
fn set_menu_bar_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    set_tray_visible(&app, visible).map_err(|e| e.to_string())
}

/// Enable/disable launch at login. `minimized` registers the login item to
/// start hidden in the menu bar (honored on macOS; on Windows/Linux the
/// flag is read from settings at launch instead).
#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool, minimized: bool) -> Result<(), String> {
    autostart::set(&app, enabled, minimized)
}

#[tauri::command]
fn is_autostart_enabled(app: AppHandle) -> Result<bool, String> {
    autostart::is_enabled(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            // macOS uses its own login-item handling (see autostart.rs); this
            // launcher choice only applies to any direct use of the plugin.
            tauri_plugin_autostart::MacosLauncher::AppleScript,
            Some(vec![AUTOSTART_FLAG]),
        ))
        .invoke_handler(tauri::generate_handler![
            desktop_version,
            frontend_ready,
            set_menu_bar_visible,
            set_autostart,
            is_autostart_enabled,
        ])
        .setup(move |app| {
            let handle = app.handle();

            // The tray is present by default; the "Show in menu bar" setting
            // can turn it off.
            let show_in_menu_bar = read_bool_setting(handle, "showInMenuBar", true);
            app.manage(TrayVisible(AtomicBool::new(show_in_menu_bar)));
            if show_in_menu_bar {
                tray::create_tray(handle)?;
            }

            // Stay hidden only when we can land somewhere reachable (the tray).
            let stay_hidden = show_in_menu_bar && launched_hidden(handle);
            app.manage(StayHidden(stay_hidden));

            // The window is configured hidden. Either we stay in the menu bar
            // (start minimized) or we wait for the frontend's `frontend_ready`
            // signal to reveal it — with a fallback timer so a broken frontend
            // can't leave the window permanently hidden.
            if stay_hidden {
                hide_main_window(handle);
            } else {
                let handle = handle.clone();
                thread::spawn(move || {
                    thread::sleep(READY_FALLBACK);
                    show_main_window(&handle);
                });
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                if app.state::<TrayVisible>().0.load(Ordering::SeqCst) {
                    // Closing hides to the tray; "Quit" in the tray menu exits.
                    api.prevent_close();
                    hide_main_window(app);
                } else {
                    // No menu-bar icon to retreat to, so closing quits.
                    app.exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
