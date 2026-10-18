//! "Launch at login" management.
//!
//! On macOS we register a real **login item** (via `System Events`) rather
//! than a Launch Agent. A login item points at the `.app` bundle, so it
//! shows up under System Settings → General → Login Items with the app's
//! real name and icon — a Launch Agent points at the raw Unix executable
//! inside the bundle and renders with a generic icon. The login item also
//! carries a `hidden` flag, which is how "start minimized" is expressed:
//! macOS launches a hidden login item without bringing its window forward,
//! and we detect that at startup via `NSApplication.isHidden` (see
//! `launched_hidden` in lib.rs).
//!
//! On Windows/Linux we delegate to `tauri-plugin-autostart`, which writes a
//! Run-key / `.desktop` entry. There "start minimized" can't ride on the OS
//! entry, so it is read back from the settings store at launch instead.

use tauri::AppHandle;

pub use imp::{is_enabled, set};

#[cfg(target_os = "macos")]
mod imp {
    use super::AppHandle;
    use std::process::{Command, Output};

    /// The `.app` bundle path (e.g. `/Applications/Example.app`), derived
    /// from the running executable. `None` when not running from a bundle
    /// (e.g. `tauri dev`), in which case autostart is a no-op.
    fn bundle_path() -> Option<String> {
        let exe = std::env::current_exe().ok()?;
        let exe = exe.canonicalize().ok()?;
        let s = exe.to_string_lossy();
        // ".../Example.app/Contents/MacOS/Example" -> ".../Example.app"
        let (before, _) = s.split_once(".app/")?;
        Some(format!("{before}.app"))
    }

    /// Login-item name: the bundle's base name without `.app`. Falls back to
    /// the package name when not running from a bundle.
    fn item_name(app: &AppHandle) -> String {
        bundle_path()
            .and_then(|p| {
                std::path::Path::new(&p)
                    .file_stem()
                    .map(|s| s.to_string_lossy().into_owned())
            })
            .unwrap_or_else(|| app.package_info().name.clone())
    }

    fn osascript(script: &str) -> std::io::Result<Output> {
        Command::new("osascript").args(["-e", script]).output()
    }

    pub fn set(app: &AppHandle, enabled: bool, minimized: bool) -> Result<(), String> {
        let name = item_name(app);

        // Always clear any existing entry first so toggling `minimized`
        // re-registers with the new `hidden` flag. Deleting a missing item
        // errors harmlessly, so the result is ignored.
        let _ = osascript(&format!(
            "tell application \"System Events\" to delete login item \"{name}\""
        ));

        if enabled {
            let path = bundle_path().ok_or_else(|| {
                "not running from an .app bundle (launch at login needs a built app)".to_string()
            })?;
            let script = format!(
                "tell application \"System Events\" to make login item at end \
                 with properties {{name:\"{name}\", path:\"{path}\", hidden:{}}}",
                if minimized { "true" } else { "false" }
            );
            let out = osascript(&script).map_err(|e| e.to_string())?;
            if !out.status.success() {
                return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
            }
        }
        Ok(())
    }

    pub fn is_enabled(app: &AppHandle) -> Result<bool, String> {
        let name = item_name(app);
        let out =
            osascript("tell application \"System Events\" to get the name of every login item")
                .map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
        }
        let stdout = String::from_utf8_lossy(&out.stdout);
        Ok(stdout.split(',').map(str::trim).any(|n| n == name))
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    use super::AppHandle;
    use tauri_plugin_autostart::ManagerExt;

    // `minimized` rides on the settings store on these platforms (read back
    // at launch), not on the OS entry, so it is ignored here.
    pub fn set(app: &AppHandle, enabled: bool, _minimized: bool) -> Result<(), String> {
        let manager = app.autolaunch();
        if enabled {
            manager.enable()
        } else {
            manager.disable()
        }
        .map_err(|e| e.to_string())
    }

    pub fn is_enabled(app: &AppHandle) -> Result<bool, String> {
        app.autolaunch().is_enabled().map_err(|e| e.to_string())
    }
}
