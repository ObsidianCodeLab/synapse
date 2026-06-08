use std::path::PathBuf;
use tauri::{Manager, path::BaseDirectory};

/// 去掉 Windows 扩展路径前缀 `\\?\`，便于 cmd、send-keys 等场景识别。
#[cfg(target_os = "windows")]
fn strip_verbatim_prefix(p: PathBuf) -> PathBuf {
    let Some(s) = p.to_str() else {
        return p;
    };
    if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    p
}

/// 开发时 exe 在 `src-tauri/target/debug/`，回退到 `src-tauri/resources/synapse-term/`。
#[cfg(target_os = "windows")]
fn fallback_repo_resource(name: &str) -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let src_tauri_dir = exe.parent()?.parent()?.parent()?;
    let candidate = src_tauri_dir
        .join("resources")
        .join("synapse-term")
        .join(name);
    if candidate.is_file() || candidate.is_dir() {
        Some(strip_verbatim_prefix(candidate))
    } else {
        None
    }
}

#[allow(dead_code)]
pub fn tmux_exe_path(app: &tauri::AppHandle) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let data_dir = app
            .path()
            .app_data_dir()
            .expect("cannot resolve app data dir");
        let tmux_exe = data_dir.join("tmux.exe");

        if !tmux_exe.exists() {
            extract_bundled_tmux(app, &tmux_exe);
        }

        tmux_exe
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        PathBuf::from("tmux")
    }
}

/// Windows：`resources/synapse-term/psmux.exe`
pub fn psmux_exe_path(app: &tauri::AppHandle) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let p = app
            .path()
            .resolve(
                "resources/synapse-term/psmux.exe",
                BaseDirectory::Resource,
            )
            .expect("cannot resolve bundled psmux.exe path");
        let p = strip_verbatim_prefix(p);
        if p.is_file() {
            p
        } else {
            fallback_repo_resource("psmux.exe").unwrap_or(p)
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        PathBuf::from("psmux")
    }
}

pub fn lazygit_exe_path(app: &tauri::AppHandle) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let p = app
            .path()
            .resolve(
                "resources/synapse-term/lazygit.exe",
                BaseDirectory::Resource,
            )
            .expect("cannot resolve bundled lazygit.exe path");
        let p = strip_verbatim_prefix(p);
        if p.is_file() {
            p
        } else {
            fallback_repo_resource("lazygit.exe").unwrap_or(p)
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        PathBuf::from("lazygit")
    }
}

#[cfg(target_os = "windows")]
#[allow(dead_code)]
fn extract_bundled_tmux(app: &tauri::AppHandle, dest: &PathBuf) {
    use std::io::Read;

    let zip_path = app
        .path()
        .resolve(
            "resources/synapse-term/tmux-windows-v3.6a-win32.7.zip",
            BaseDirectory::Resource,
        )
        .expect("cannot resolve bundled tmux zip path");

    let zip_file = std::fs::File::open(&zip_path)
        .unwrap_or_else(|e| panic!("cannot open bundled tmux zip at {zip_path:?}: {e}"));

    let mut archive =
        zip::ZipArchive::new(zip_file).expect("cannot read bundled tmux zip archive");

    let mut entry = archive
        .by_name("tmux.exe")
        .expect("tmux.exe not found in bundled zip");

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).expect("cannot create app data dir");
    }

    let mut buf = Vec::new();
    entry
        .read_to_end(&mut buf)
        .expect("cannot read tmux.exe from zip");
    std::fs::write(dest, &buf).expect("cannot write tmux.exe to app data dir");
}
