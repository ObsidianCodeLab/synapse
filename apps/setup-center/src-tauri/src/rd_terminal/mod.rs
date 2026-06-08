//! 研发中心终端：psmux / PTY / 工单工作区（仅 Windows 下实际生效）。

mod deps;
mod pty_manager;
mod transcripts;

pub mod commands;
pub use pty_manager::PtyManager;

#[cfg(target_os = "windows")]
pub fn kill_psmux_hard() {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let _ = Command::new("taskkill")
        .args(["/IM", "psmux.exe", "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

#[cfg(not(target_os = "windows"))]
pub fn kill_psmux_hard() {}

#[inline]
pub fn force_kill_psmux_on_exit() {
    kill_psmux_hard();
}
