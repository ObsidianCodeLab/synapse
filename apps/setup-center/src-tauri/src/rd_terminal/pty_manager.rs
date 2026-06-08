use anyhow::{Context, Result};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

pub type SessionId = u32;

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn portable_pty::ChildKiller + Send + Sync>,
}

#[derive(Clone)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<SessionId, Session>>>,
    next_id: Arc<Mutex<SessionId>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(Mutex::new(1)),
        }
    }

    pub fn create_attach_session(
        &self,
        app: AppHandle,
        rows: u16,
        cols: u16,
        target_session: &str,
    ) -> Result<SessionId> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("failed to open pty")?;

        let psmux_path = super::deps::psmux_exe_path(&app);
        let mut cmd = CommandBuilder::new(psmux_path.as_os_str());
        cmd.args(["attach-session", "-t", target_session]);

        #[cfg(target_os = "windows")]
        if let Some(bin_dir) = psmux_path.parent() {
            let bin_str = bin_dir.to_string_lossy();
            let current_path = std::env::var("PATH").unwrap_or_default();
            let new_path = if current_path.is_empty() {
                bin_str.to_string()
            } else {
                format!("{};{}", bin_str, current_path)
            };
            cmd.env("PATH", new_path);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .context("failed to spawn psmux attach-session")?;

        let killer = child.clone_killer();

        let mut reader = pair
            .master
            .try_clone_reader()
            .context("failed to clone reader")?;
        let writer = pair
            .master
            .take_writer()
            .context("failed to take writer")?;

        let session_id = {
            let mut id = self.next_id.lock().unwrap();
            let current = *id;
            *id += 1;
            current
        };

        let app_clone = app.clone();
        let sid = session_id;
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = base64_encode(&buf[..n]);
                        let _ = app_clone.emit(&format!("pty://data/{sid}"), data);
                    }
                    Err(_) => break,
                }
            }
            let _ = app_clone.emit(&format!("pty://exit/{sid}"), ());
        });

        self.sessions.lock().unwrap().insert(
            session_id,
            Session {
                master: pair.master,
                writer,
                killer,
            },
        );

        Ok(session_id)
    }

    pub fn write(&self, session_id: SessionId, data: &[u8]) -> Result<()> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(&session_id)
            .context("session not found")?;
        session.writer.write_all(data)?;
        session.writer.flush()?;
        Ok(())
    }

    pub fn resize(&self, session_id: SessionId, rows: u16, cols: u16) -> Result<()> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions.get(&session_id).context("session not found")?;
        session.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        Ok(())
    }

    pub fn close(&self, session_id: SessionId) -> Result<()> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(mut session) = sessions.remove(&session_id) {
            let _ = session.killer.kill();
        }
        Ok(())
    }
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(CHARS[((n >> 18) & 63) as usize] as char);
        out.push(CHARS[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            CHARS[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            CHARS[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}
