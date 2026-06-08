use super::commands::{normalize_pane_target, run_psmux_with_timeout};
use super::deps::psmux_exe_path;
use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::AppHandle;

const PANE_SNAPSHOT: &str = "0.0";
const SNAPSHOT_FILENAME: &str = "claude-0.log";
const CAPTURE_INTERVAL: Duration = Duration::from_secs(2);
const PSMUX_CAPTURE_TIMEOUT: Duration = Duration::from_secs(15);

fn pipeline_log(project_path: &Path, message: &str) {
    let path = project_path.join("transcript-pipeline.log");
    let ts = format!("{:?}", std::time::SystemTime::now());
    let line = format!("[{ts}] {message}\n");
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .and_then(|mut f| f.write_all(line.as_bytes()));
    eprintln!("[transcripts] {message}");
}

const MAX_WORK_ORDER_SEGMENT_LEN: usize = 120;

pub fn sanitize_work_order_segment(input: Option<&str>) -> String {
    let raw = input.map(str::trim).filter(|s| !s.is_empty()).unwrap_or("default");
    let path = Path::new(raw);
    let base = path
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(raw);
    let mut out = String::new();
    for c in base.chars() {
        if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
            out.push(c);
        } else if c.is_whitespace() {
            if !out.ends_with('_') {
                out.push('_');
            }
        } else if !c.is_control() {
            out.push('_');
        }
    }
    let out = out.trim_matches('_').to_string();
    if out.is_empty() || out == "." || out == ".." {
        return "default".to_string();
    }
    if out.len() > MAX_WORK_ORDER_SEGMENT_LEN {
        out[..MAX_WORK_ORDER_SEGMENT_LEN].to_string()
    } else {
        out
    }
}

/// 快照目录即传入的 `project_path`。
/// 研发中心前端已传入 `{用户目录}/.synapse/work/{工单ID}/`，故此处不再拼接 `.synapse/work/…`，
/// 最终文件为 `{project_path}/claude-0.log`（与 `{工程目录}/.synapse/work/{工单ID}/claude-0.log` 一致）。
pub fn transcript_dir(project_path: &Path, _work_order_key: Option<&str>) -> PathBuf {
    project_path.to_path_buf()
}

static REGISTRY: OnceLock<Mutex<HashMap<String, Vec<Arc<AtomicBool>>>>> = OnceLock::new();

fn registry() -> &'static Mutex<HashMap<String, Vec<Arc<AtomicBool>>>> {
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn stop_session_flags(session_name: &str) {
    if let Ok(mut map) = registry().lock() {
        if let Some(flags) = map.remove(session_name) {
            for f in flags {
                f.store(true, Ordering::Relaxed);
            }
        }
    }
}

fn capture_pane_snapshot(psmux_exe: &Path, pane_target: &str) -> Result<Vec<u8>, String> {
    let out = run_psmux_with_timeout(
        psmux_exe.to_path_buf(),
        vec![
            "capture-pane".into(),
            "-p".into(),
            "-t".into(),
            pane_target.to_string(),
        ],
        PSMUX_CAPTURE_TIMEOUT,
    )?;
    Ok(out.stdout)
}

fn sanitize_snapshot_bytes(raw: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(raw.len());
    let mut i = 0usize;
    while i < raw.len() {
        match raw[i] {
            0x1b => {
                i += 1;
                if i >= raw.len() {
                    break;
                }
                match raw[i] {
                    b'[' => {
                        i += 1;
                        while i < raw.len() && !(0x40..=0x7e).contains(&raw[i]) {
                            i += 1;
                        }
                        i += 1;
                    }
                    b']' => {
                        i += 1;
                        while i < raw.len() {
                            if raw[i] == 0x07 {
                                i += 1;
                                break;
                            }
                            if raw[i] == 0x1b
                                && i + 1 < raw.len()
                                && raw[i + 1] == b'\\'
                            {
                                i += 2;
                                break;
                            }
                            i += 1;
                        }
                    }
                    b'P' | b'X' | b'^' | b'_' => {
                        i += 1;
                        while i < raw.len() {
                            if raw[i] == 0x1b
                                && i + 1 < raw.len()
                                && raw[i + 1] == b'\\'
                            {
                                i += 2;
                                break;
                            }
                            i += 1;
                        }
                    }
                    b'(' | b')' | b'#' => {
                        i += 1;
                        if i < raw.len() {
                            i += 1;
                        }
                    }
                    b'%' => {
                        i += 1;
                        if i < raw.len() {
                            i += 1;
                        }
                    }
                    b'N' | b'O' | b'\\' => {
                        i += 1;
                        if i < raw.len() {
                            i += 1;
                        }
                    }
                    _ => {
                        i += 1;
                    }
                }
            }
            0x0d => {
                i += 1;
            }
            0x07 | 0x08 | 0x0b | 0x0c | 0x0e | 0x0f => {
                i += 1;
            }
            0x00..=0x08 | 0x0e..=0x1a | 0x1c..=0x1f => {
                i += 1;
            }
            _ => {
                out.push(raw[i]);
                i += 1;
            }
        }
    }
    let text = String::from_utf8_lossy(&out);
    let text: String = text.chars().filter(|&c| c != '\u{FFFD}').collect();
    text.into_bytes()
}

fn atomic_write_snapshot(dir: &Path, data: &[u8]) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let final_path = dir.join(SNAPSHOT_FILENAME);
    let tmp_path = dir.join(".claude-0.log.tmp");
    std::fs::write(&tmp_path, data)?;
    std::fs::rename(&tmp_path, &final_path)?;
    Ok(())
}

fn capture_worker(
    psmux_exe: PathBuf,
    session_name: String,
    project_path: PathBuf,
    work_order_key: Option<String>,
    stop: Arc<AtomicBool>,
) {
    let pane = normalize_pane_target(&session_name, PANE_SNAPSHOT);
    let dir = transcript_dir(&project_path, work_order_key.as_deref());

    while !stop.load(Ordering::Relaxed) {
        match capture_pane_snapshot(&psmux_exe, &pane) {
            Ok(bytes) => {
                let cleaned = sanitize_snapshot_bytes(&bytes);
                if let Err(e) = atomic_write_snapshot(&dir, &cleaned) {
                    pipeline_log(
                        &project_path,
                        &format!("snapshot write failed: {e} dir={}", dir.display()),
                    );
                }
            }
            Err(e) => {
                pipeline_log(
                    &project_path,
                    &format!("capture-pane failed pane={pane}: {e}"),
                );
            }
        }

        let step = Duration::from_millis(100);
        let mut waited = Duration::ZERO;
        while waited < CAPTURE_INTERVAL {
            if stop.load(Ordering::Relaxed) {
                return;
            }
            std::thread::sleep(step);
            waited += step;
        }
    }
}

pub fn start_all(
    app: &AppHandle,
    session_name: &str,
    project_path: &Path,
    work_order_key: Option<&str>,
) -> Result<(), String> {
    let _ = std::fs::create_dir_all(project_path);
    let dir = transcript_dir(project_path, work_order_key);
    pipeline_log(
        project_path,
        &format!(
            "start_all capture-pane snapshot session={session_name} dir={} interval={:?}",
            dir.display(),
            CAPTURE_INTERVAL
        ),
    );

    stop_session_flags(session_name);
    pipeline_log(project_path, "start_all stopped previous capture workers");

    std::fs::create_dir_all(&dir).map_err(|e| format!("create transcript dir: {e}"))?;

    let psmux_exe = psmux_exe_path(app);
    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = stop.clone();
    let session_owned = session_name.to_string();
    let pb = project_path.to_path_buf();
    let wok = work_order_key.map(|s| s.to_string());

    std::thread::spawn(move || {
        capture_worker(psmux_exe, session_owned, pb, wok, stop_thread);
        eprintln!("[transcripts] capture worker exited");
    });

    if let Ok(mut map) = registry().lock() {
        map.insert(session_name.to_string(), vec![stop]);
    }

    pipeline_log(project_path, "start_all finished ok");
    Ok(())
}

pub fn stop_all(_app: &AppHandle, session_name: &str) -> Result<(), String> {
    stop_session_flags(session_name);
    Ok(())
}
