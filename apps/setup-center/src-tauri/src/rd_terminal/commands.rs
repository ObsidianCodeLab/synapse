use super::pty_manager::{PtyManager, SessionId};
use super::transcripts;
use std::io::Read;
use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};

use tauri::path::BaseDirectory;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 可选会话缺省：与 `sanitize_work_order_segment(None)` 的 `default` 段一致。
const DEFAULT_RD_SESSION: &str = "synapse-work-default";

fn rd_require_windows() -> Result<(), String> {
    if cfg!(target_os = "windows") {
        Ok(())
    } else {
        Err("研发中心仅支持 Windows 桌面端".to_string())
    }
}

fn default_work_dir_for_segment(sanitized_segment: &str) -> PathBuf {
    dirs_next::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".synapse")
        .join("work")
        .join(sanitized_segment)
}

fn apply_no_window(cmd: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

#[tauri::command]
pub async fn create_agent_workspace(
    app: AppHandle,
    session_name: Option<String>,
    project_path: Option<String>,
    work_order_key: Option<String>,
) -> Result<(), String> {
    rd_require_windows()?;
    let script_path = app
        .path()
        .resolve(
            "resources/synapse-term/agent-workspace.ps1",
            BaseDirectory::Resource,
        )
        .map_err(|e| e.to_string())?;

    let psmux_exe = super::deps::psmux_exe_path(&app);
    let lazygit_exe = super::deps::lazygit_exe_path(&app);
    #[cfg(target_os = "windows")]
    {
        if !psmux_exe.exists() {
            return Err(format!("psmux.exe not found at {:?}", psmux_exe));
        }
        if !lazygit_exe.exists() {
            return Err(format!("lazygit.exe not found at {:?}", lazygit_exe));
        }
    }
    let psmux_exe_str = psmux_exe.to_string_lossy().into_owned();
    let lazygit_exe_str = lazygit_exe.to_string_lossy().into_owned();

    let sanitized_seg = transcripts::sanitize_work_order_segment(work_order_key.as_deref());
    let session_name = session_name.unwrap_or_else(|| format!("synapse-work-{sanitized_seg}"));
    let project_pb = if let Some(p) = project_path {
        PathBuf::from(p)
    } else {
        default_work_dir_for_segment(&sanitized_seg)
    };
    std::fs::create_dir_all(&project_pb).map_err(|e| format!("create project dir: {e}"))?;
    let project_path_str = project_pb.to_string_lossy().into_owned();

    let output = tokio::task::spawn_blocking(move || {
        let mut cmd = Command::new("powershell.exe");
        apply_no_window(&mut cmd);
        cmd.arg("-NoProfile")
            .arg("-NonInteractive")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-File")
            .arg(script_path)
            .arg("-SessionName")
            .arg(session_name)
            .arg("-ProjectPath")
            .arg(project_path_str)
            .arg("-PsmuxExe")
            .arg(psmux_exe_str)
            .arg("-LazygitExe")
            .arg(lazygit_exe_str);

        cmd.output()
            .map_err(|e| format!("failed to run powershell: {e}"))
    })
    .await
    .map_err(|e| e.to_string())??;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "agent-workspace.ps1 failed (exit={:?}). stdout: {} stderr: {}",
            output.status.code(),
            stdout,
            stderr
        ));
    }

    Ok(())
}

#[tauri::command]
pub async fn transcripts_start(
    app: AppHandle,
    session_name: Option<String>,
    project_path: Option<String>,
    work_order_key: Option<String>,
) -> Result<(), String> {
    rd_require_windows()?;
    let sanitized_seg = transcripts::sanitize_work_order_segment(work_order_key.as_deref());
    let session_name = session_name.unwrap_or_else(|| format!("synapse-work-{sanitized_seg}"));
    let pb = if let Some(p) = project_path {
        PathBuf::from(p)
    } else {
        default_work_dir_for_segment(&sanitized_seg)
    };
    std::fs::create_dir_all(&pb).map_err(|e| format!("create project dir: {e}"))?;
    tokio::task::spawn_blocking(move || {
        transcripts::start_all(
            &app,
            &session_name,
            &pb,
            work_order_key.as_deref(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn transcripts_stop(
    app: AppHandle,
    session_name: Option<String>,
) -> Result<(), String> {
    rd_require_windows()?;
    let session_name = session_name.unwrap_or_else(|| DEFAULT_RD_SESSION.to_string());
    tokio::task::spawn_blocking(move || transcripts::stop_all(&app, &session_name))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn agent_psmux_kill_session(
    app: AppHandle,
    session_name: Option<String>,
) -> Result<(), String> {
    rd_require_windows()?;
    let session_name = session_name.unwrap_or_else(|| DEFAULT_RD_SESSION.to_string());
    let psmux_exe = super::deps::psmux_exe_path(&app);
    tokio::task::spawn_blocking(move || {
        run_psmux_best_effort(
            psmux_exe,
            vec!["kill-session".into(), "-t".into(), session_name],
            Duration::from_secs(15),
        )?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pty_write(
    manager: State<'_, PtyManager>,
    session_id: SessionId,
    data: String,
) -> Result<(), String> {
    rd_require_windows()?;
    let bytes = base64_decode(&data).map_err(|e| e.to_string())?;
    manager.write(session_id, &bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pty_resize(
    manager: State<'_, PtyManager>,
    session_id: SessionId,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    rd_require_windows()?;
    manager
        .resize(session_id, rows, cols)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pty_close(
    manager: State<'_, PtyManager>,
    session_id: SessionId,
) -> Result<(), String> {
    rd_require_windows()?;
    manager.close(session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pty_create_attach(
    app: AppHandle,
    manager: State<'_, PtyManager>,
    rows: u16,
    cols: u16,
    target_session: String,
) -> Result<SessionId, String> {
    rd_require_windows()?;
    manager
        .create_attach_session(app, rows, cols, &target_session)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn agent_env_write(
    app: AppHandle,
    session_name: String,
    pane_target: String,
    data: String,
) -> Result<(), String> {
    rd_require_windows()?;
    let target = normalize_pane_target(&session_name, &pane_target);
    let psmux_exe = super::deps::psmux_exe_path(&app);
    tokio::task::spawn_blocking(move || {
        if data.trim().is_empty() {
            return Err("data cannot be empty".to_string());
        }
        send_literal_data(psmux_exe.clone(), &target, data)?;
        send_token_data(psmux_exe, &target, "Enter".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn write_data(
    app: AppHandle,
    session_name: String,
    pane_target: String,
    data: String,
) -> Result<(), String> {
    rd_require_windows()?;
    let target = normalize_pane_target(&session_name, &pane_target);
    let psmux_exe = super::deps::psmux_exe_path(&app);
    tokio::task::spawn_blocking(move || {
        if data.trim().is_empty() {
            return Err("data cannot be empty".to_string());
        }
        send_literal_data(psmux_exe, &target, data)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn write_rawBytes(
    app: AppHandle,
    session_name: String,
    pane_target: String,
    data: String,
) -> Result<(), String> {
    rd_require_windows()?;
    let target = normalize_pane_target(&session_name, &pane_target);
    let psmux_exe = super::deps::psmux_exe_path(&app);
    tokio::task::spawn_blocking(move || {
        if data.trim().is_empty() {
            return Err("data cannot be empty".to_string());
        }
        send_token_data(psmux_exe, &target, data)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn agent_env_control(
    app: AppHandle,
    session_name: String,
    pane_target: String,
    data: String,
) -> Result<(), String> {
    rd_require_windows()?;
    let target = normalize_pane_target(&session_name, &pane_target);
    let psmux_exe = super::deps::psmux_exe_path(&app);
    tokio::task::spawn_blocking(move || {
        if data.trim().is_empty() {
            return Err("data cannot be empty".to_string());
        }
        send_token_data(psmux_exe, &target, data)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn agent_pane0_scroll_page_up(
    app: AppHandle,
    session_name: Option<String>,
) -> Result<(), String> {
    rd_require_windows()?;
    let session_name = session_name.unwrap_or_else(|| DEFAULT_RD_SESSION.to_string());
    let pane = normalize_pane_target(&session_name, "0.0");
    let cmd_in = format!("send-keys -t {pane} -X page-up");
    let cmd_out = format!("copy-mode -t {pane} ; send-keys -t {pane} -X page-up");
    let psmux_exe = super::deps::psmux_exe_path(&app);
    tokio::task::spawn_blocking(move || {
        run_psmux_with_timeout(
            psmux_exe,
            vec![
                "if-shell".into(),
                "-F".into(),
                "#{pane_in_mode}".into(),
                "-t".into(),
                pane,
                cmd_in,
                cmd_out,
            ],
            Duration::from_secs(10),
        )?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn agent_pane0_scroll_page_down(
    app: AppHandle,
    session_name: Option<String>,
) -> Result<(), String> {
    rd_require_windows()?;
    let session_name = session_name.unwrap_or_else(|| DEFAULT_RD_SESSION.to_string());
    let pane = normalize_pane_target(&session_name, "0.0");
    let cmd_in = format!("send-keys -t {pane} -X page-down");
    let cmd_out = format!("copy-mode -e -t {pane} ; send-keys -t {pane} -X page-down");
    let psmux_exe = super::deps::psmux_exe_path(&app);
    tokio::task::spawn_blocking(move || {
        run_psmux_with_timeout(
            psmux_exe,
            vec![
                "if-shell".into(),
                "-F".into(),
                "#{pane_in_mode}".into(),
                "-t".into(),
                pane,
                cmd_in,
                cmd_out,
            ],
            Duration::from_secs(10),
        )?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn agent_pane0_clear_copy_mode(
    app: AppHandle,
    session_name: Option<String>,
) -> Result<(), String> {
    rd_require_windows()?;
    let session_name = session_name.unwrap_or_else(|| DEFAULT_RD_SESSION.to_string());
    let pane = normalize_pane_target(&session_name, "0.0");
    let psmux_exe = super::deps::psmux_exe_path(&app);
    tokio::task::spawn_blocking(move || {
        for _ in 0..5 {
            run_psmux_best_effort(
                psmux_exe.clone(),
                vec![
                    "send-keys".into(),
                    "-t".into(),
                    pane.clone(),
                    "-X".into(),
                    "cancel".into(),
                ],
                Duration::from_secs(5),
            )?;
        }
        run_psmux_with_timeout(
            psmux_exe,
            vec!["select-pane".into(), "-t".into(), pane],
            Duration::from_secs(10),
        )?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn agent_pane0_scroll_to_latest(
    app: AppHandle,
    session_name: Option<String>,
) -> Result<(), String> {
    rd_require_windows()?;
    let session_name = session_name.unwrap_or_else(|| DEFAULT_RD_SESSION.to_string());
    let pane = normalize_pane_target(&session_name, "0.0");
    let psmux_exe = super::deps::psmux_exe_path(&app);
    tokio::task::spawn_blocking(move || {
        run_psmux_best_effort(
            psmux_exe.clone(),
            vec![
                "send-keys".into(),
                "-t".into(),
                pane.clone(),
                "-X".into(),
                "history-bottom".into(),
            ],
            Duration::from_secs(5),
        )?;
        run_psmux_best_effort(
            psmux_exe.clone(),
            vec![
                "send-keys".into(),
                "-t".into(),
                pane.clone(),
                "-X".into(),
                "cancel".into(),
            ],
            Duration::from_secs(5),
        )?;
        for _ in 0..4 {
            run_psmux_best_effort(
                psmux_exe.clone(),
                vec![
                    "send-keys".into(),
                    "-t".into(),
                    pane.clone(),
                    "-X".into(),
                    "cancel".into(),
                ],
                Duration::from_secs(5),
            )?;
        }
        run_psmux_with_timeout(
            psmux_exe.clone(),
            vec!["select-pane".into(), "-t".into(), pane.clone()],
            Duration::from_secs(10),
        )?;
        run_psmux_with_timeout(
            psmux_exe,
            vec![
                "send-keys".into(),
                "-t".into(),
                pane,
                "Enter".into(),
            ],
            Duration::from_secs(10),
        )?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPane0ModeInfo {
    pub mode_depth: u32,
    pub mode_name: String,
    pub copy_or_view_mode: bool,
}

fn parse_u32_trim(s: &str) -> u32 {
    s.trim().parse().unwrap_or(0)
}

#[tauri::command]
pub async fn agent_pane0_query_mode(
    app: AppHandle,
    session_name: Option<String>,
) -> Result<AgentPane0ModeInfo, String> {
    rd_require_windows()?;
    let session_name = session_name.unwrap_or_else(|| DEFAULT_RD_SESSION.to_string());
    let pane = normalize_pane_target(&session_name, "0.0");
    let psmux_exe = super::deps::psmux_exe_path(&app);
    tokio::task::spawn_blocking(move || {
        let out_depth = run_psmux_with_timeout(
            psmux_exe.clone(),
            vec![
                "display-message".into(),
                "-p".into(),
                "-t".into(),
                pane.clone(),
                "#{pane_in_mode}".into(),
            ],
            Duration::from_secs(10),
        )?;
        let mode_depth = parse_u32_trim(&String::from_utf8_lossy(&out_depth.stdout));

        let out_name = run_psmux_with_timeout(
            psmux_exe,
            vec![
                "display-message".into(),
                "-p".into(),
                "-t".into(),
                pane,
                "#{pane_mode}".into(),
            ],
            Duration::from_secs(10),
        )?;
        let mode_name = String::from_utf8_lossy(&out_name.stdout).trim().to_string();
        let copy_or_view_mode = matches!(mode_name.as_str(), "copy-mode" | "view-mode");

        Ok(AgentPane0ModeInfo {
            mode_depth,
            mode_name,
            copy_or_view_mode,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn send_literal_data(psmux_exe: std::path::PathBuf, target: &str, data: String) -> Result<(), String> {
    let args = vec![
        "send-keys".to_string(),
        "-l".to_string(),
        "-t".to_string(),
        target.to_string(),
        data,
    ];
    run_psmux_with_timeout(psmux_exe, args, Duration::from_secs(10))
        .map_err(|e| format!("write_data target={} {e}", target))?;
    Ok(())
}

fn send_token_data(psmux_exe: std::path::PathBuf, target: &str, token: String) -> Result<(), String> {
    let args = vec![
        "send-keys".to_string(),
        "-t".to_string(),
        target.to_string(),
        token,
    ];
    run_psmux_with_timeout(psmux_exe, args, Duration::from_secs(10))
        .map_err(|e| format!("write_rawBytes target={} {e}", target))?;
    Ok(())
}

pub(crate) fn normalize_pane_target(session_name: &str, pane_target: &str) -> String {
    if pane_target.contains(':') {
        pane_target.to_string()
    } else {
        format!("{session_name}:{pane_target}")
    }
}

fn run_psmux_with_timeout_impl(
    psmux_exe: std::path::PathBuf,
    args: Vec<String>,
    timeout: Duration,
    require_success: bool,
) -> Result<std::process::Output, String> {
    let mut command = Command::new(&psmux_exe);
    apply_no_window(&mut command);

    #[cfg(target_os = "windows")]
    if let Some(bin_dir) = psmux_exe.parent() {
        let bin_str = bin_dir.to_string_lossy();
        let current_path = std::env::var("PATH").unwrap_or_default();
        let new_path = if current_path.is_empty() {
            bin_str.to_string()
        } else {
            format!("{};{}", bin_str, current_path)
        };
        command.env("PATH", new_path);
    }

    let mut child = command
        .args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to start psmux: {e}"))?;

    let start = Instant::now();
    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|e| format!("failed waiting psmux: {e}"))?
        {
            let mut stdout = Vec::new();
            if let Some(mut s) = child.stdout.take() {
                let _ = s.read_to_end(&mut stdout);
            }
            let mut stderr = Vec::new();
            if let Some(mut s) = child.stderr.take() {
                let _ = s.read_to_end(&mut stderr);
            }

            let output = std::process::Output {
                status,
                stdout,
                stderr,
            };
            if require_success && !output.status.success() {
                let stderr_str = String::from_utf8_lossy(&output.stderr);
                let stdout_str = String::from_utf8_lossy(&output.stdout);
                return Err(format!(
                    "psmux failed (exit={:?}) args={:?} stdout: {} stderr: {}",
                    output.status.code(),
                    args,
                    stdout_str,
                    stderr_str
                ));
            }
            return Ok(output);
        }

        if start.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("psmux timed out after {:?}", timeout));
        }

        std::thread::sleep(Duration::from_millis(25));
    }
}

pub(crate) fn run_psmux_with_timeout(
    psmux_exe: std::path::PathBuf,
    args: Vec<String>,
    timeout: Duration,
) -> Result<std::process::Output, String> {
    run_psmux_with_timeout_impl(psmux_exe, args, timeout, true)
}

pub(crate) fn run_psmux_best_effort(
    psmux_exe: std::path::PathBuf,
    args: Vec<String>,
    timeout: Duration,
) -> Result<(), String> {
    run_psmux_with_timeout_impl(psmux_exe, args, timeout, false)?;
    Ok(())
}

fn base64_decode(s: &str) -> anyhow::Result<Vec<u8>> {
    let s = s.as_bytes();
    let mut out = Vec::with_capacity(s.len() / 4 * 3);
    let decode_char = |c: u8| -> anyhow::Result<u8> {
        match c {
            b'A'..=b'Z' => Ok(c - b'A'),
            b'a'..=b'z' => Ok(c - b'a' + 26),
            b'0'..=b'9' => Ok(c - b'0' + 52),
            b'+' => Ok(62),
            b'/' => Ok(63),
            b'=' => Ok(0),
            _ => anyhow::bail!("invalid base64 char: {c}"),
        }
    };
    for chunk in s.chunks(4) {
        if chunk.len() < 4 {
            break;
        }
        let a = decode_char(chunk[0])?;
        let b = decode_char(chunk[1])?;
        let c = decode_char(chunk[2])?;
        let d = decode_char(chunk[3])?;
        out.push((a << 2) | (b >> 4));
        if chunk[2] != b'=' {
            out.push((b << 4) | (c >> 2));
        }
        if chunk[3] != b'=' {
            out.push((c << 6) | d);
        }
    }
    Ok(out)
}
