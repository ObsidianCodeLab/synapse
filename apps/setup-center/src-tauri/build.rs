fn main() {
    // 开发/CI 友好：如果缺少 Windows icon.ico，则自动生成一个极简占位图标，
    // 避免 `tauri-build` 在 Windows 上直接失败。
    //
    // 注意：这里生成的只是占位图标。正式发布建议用 `tauri icon` 生成完整图标集。
    ensure_placeholder_windows_icon();

    // 图标变更时强制重新嵌入，避免任务栏仍显示旧图标
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=../../../resources/claude-code-releases");
    println!("cargo:rerun-if-changed=resources/claude-code-init");
    println!("cargo:rerun-if-changed=resources/synapse-term");
    println!("cargo:rerun-if-changed=video");

    ensure_resource_dir();
    ensure_claude_bundle_from_repo();
    ensure_gitignored_placeholders();
    // `tauri-build` 会遍历 bundle 内所有资源文件并 emit `rerun-if-changed`。
    // `claude-code-init` 里若含 marketplace 的嵌套 `.git/`，Windows 上读 pack 等文件常触发「拒绝访问」导致构建失败。
    // 模板分发不需要 git 元数据，构建前剥离。
    strip_nested_git_dirs_under_claude_code_init();

    tauri_build::build()
}

fn strip_nested_git_dirs_under_claude_code_init() {
    use std::fs;
    use std::path::Path;

    fn walk(dir: &Path) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(ty) = entry.file_type() else {
                continue;
            };
            if !ty.is_dir() {
                continue;
            }
            if path.file_name().and_then(|n| n.to_str()) == Some(".git") {
                if let Err(e) = fs::remove_dir_all(&path) {
                    eprintln!(
                        "[build] remove nested {}: {e}",
                        path.display()
                    );
                }
                continue;
            }
            walk(&path);
        }
    }

    let root = Path::new("resources").join("claude-code-init");
    if root.is_dir() {
        walk(&root);
    }
}

fn ensure_resource_dir() {
    let dir = std::path::Path::new("resources").join("synapse-server");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
}

/// 若仓库根目录存在 `resources/claude-code-releases/`，构建时同步到 `src-tauri/resources/`，便于打包内置 Claude CLI。
fn ensure_claude_bundle_from_repo() {
    fn copy_tree(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
        if !src.is_dir() {
            return Ok(());
        }
        std::fs::create_dir_all(dst)?;
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            let dest = dst.join(entry.file_name());
            let ty = entry.file_type()?;
            if ty.is_dir() {
                copy_tree(&entry.path(), &dest)?;
            } else {
                let _ = std::fs::copy(entry.path(), &dest)?;
            }
        }
        Ok(())
    }

    let repo_claude = std::path::Path::new("..")
        .join("..")
        .join("..")
        .join("resources")
        .join("claude-code-releases");
    let dst = std::path::Path::new("resources").join("claude-code-releases");
    if repo_claude.is_dir() {
        if let Err(e) = copy_tree(&repo_claude, &dst) {
            eprintln!("[build] sync claude-code-releases from repo: {e}");
        }
    }
    // `tauri.conf.json` bundles this path; it must exist even when sync is skipped or fails.
    if !dst.is_dir() {
        std::fs::create_dir_all(&dst).unwrap_or_else(|e| {
            panic!(
                "[build] failed to create {} (required by tauri bundle): {e}",
                dst.display()
            );
        });
    }
}

/// include_str!() 引用的 gitignored 文件，clone 后不存在会导致编译失败
fn ensure_gitignored_placeholders() {
    let persona_path = std::path::Path::new("..").join("..").join("..").join("identity").join("personas").join("user_custom.md");
    if !persona_path.exists() {
        let _ = std::fs::create_dir_all(persona_path.parent().unwrap());
        let _ = std::fs::write(&persona_path, "# User Custom Persona (placeholder)\n");
    }
}

fn ensure_placeholder_windows_icon() {
    use base64::Engine;
    use flate2::read::GzDecoder;
    use std::io::Read;

    // Only needed for Windows targets, but keep it harmless on others.
    let icons_dir = std::path::Path::new("icons");
    let icon_path = icons_dir.join("icon.ico");
    if std::env::var("SYNAPSE_SETUP_CENTER_SKIP_ICON").ok().as_deref() == Some("1") {
        return;
    }
    // 如果仓库/项目已经提供了 icon.ico（例如通过 `tauri icon` 生成），不要覆盖它。
    if icon_path.exists() {
        return;
    }

    // 占位 ICO（16x16 透明），用 gzip+base64 存储以避免超长字符串被截断。
    // Source: KEINOS/blank_favicon_ico (gzip base64)
    const ICO_GZ_B64: &str =
        "H4sIAAAAAAAAA2NgYARCAQEGIKnAkMHCwCDGwMCgAcRAIaAIRBwX+P///ygexaN4xGIGijAASeibMX4EAAA=";

    let Ok(gz_bytes) = base64::engine::general_purpose::STANDARD.decode(ICO_GZ_B64) else {
        return;
    };

    let mut decoder = GzDecoder::new(&gz_bytes[..]);
    let mut bytes = Vec::new();
    if decoder.read_to_end(&mut bytes).is_err() {
        return;
    }

    let _ = std::fs::create_dir_all(icons_dir);
    let _ = std::fs::write(icon_path, bytes);
}

