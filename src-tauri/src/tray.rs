use tauri::{
    AppHandle,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
};

/// Status-bar / tray icon with a minimal Open + Quit menu. The icon is
/// always present so the app stays reachable while the window is
/// hidden.
pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItemBuilder::with_id("open", "Open").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app)
        .item(&open)
        .separator()
        .item(&quit)
        .build()?;

    let mut tray = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => crate::show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        // Template icon: macOS renders it monochrome to match the menu bar.
        tray = tray.icon(icon.clone()).icon_as_template(true);
    }

    tray.build(app)?;
    Ok(())
}
