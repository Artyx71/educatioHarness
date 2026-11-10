fn main() {
    // WebKitGTK 2.52 on the tested Hyprland setup fails to paint its Wayland
    // surface (GBM buffer errors). XWayland/software rendering is reliable.
    // Keep this workaround scoped to Hyprland; other Linux desktops use their
    // normal GTK backend and scale.
    #[cfg(target_os = "linux")]
    if std::env::var_os("HYPRLAND_INSTANCE_SIGNATURE").is_some() {
        std::env::set_var("GDK_BACKEND", "x11");
        std::env::set_var("GDK_SCALE", "1");
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        std::env::set_var("LIBGL_ALWAYS_SOFTWARE", "1");
    }
    educatio_harness_lib::run();
}
