/** Cursor Agent CLI（agent）检测与一键安装（Tauri + 后端 API） */

import { IS_TAURI, invoke, listen } from '../platform';

export interface CursorAgentCliStatus {
  installed: boolean;
  logged_in?: boolean;
  ready?: boolean;
  path?: string;
  version?: string | null;
  auth_message?: string;
  error?: string;
  install_hint?: string;
  platform?: string;
}

export interface CursorAgentCliCheckResult {
  installed: boolean;
  loggedIn: boolean;
  ready: boolean;
  version?: string | null;
  authMessage?: string | null;
}

function wireToCheckResult(data: Record<string, unknown>): CursorAgentCliCheckResult {
  return {
    installed: Boolean(data.installed),
    loggedIn: Boolean(data.loggedIn ?? data.logged_in),
    ready: Boolean(data.ready),
    version: (data.version as string | null | undefined) ?? null,
    authMessage: (data.authMessage as string | null | undefined)
      ?? (data.auth_message as string | null | undefined)
      ?? null,
  };
}

export async function fetchCursorAgentCliStatus(synapseApiBase: string): Promise<CursorAgentCliStatus> {
  const base = synapseApiBase.replace(/\/$/, '');
  const res = await fetch(`${base}/api/dev/cursor-agent-cli/status`);
  const wire = (await res.json()) as { errorcode?: number; data?: CursorAgentCliStatus; message?: string };
  if (!res.ok || wire.errorcode !== 0 || !wire.data) {
    throw new Error(wire.message || `HTTP ${res.status}`);
  }
  return wire.data;
}

export async function checkCursorAgentCliTauri(): Promise<CursorAgentCliCheckResult> {
  const raw = await invoke<Record<string, unknown>>('cursor_agent_cli_check');
  return wireToCheckResult(raw);
}

async function withInstallLog(onLog: ((text: string) => void) | undefined, fn: () => Promise<string>) {
  let unlisten: (() => void) | undefined;
  if (onLog) {
    unlisten = await listen<{ text: string }>('cursor_agent_install_log', (ev) => {
      onLog(ev.payload.text);
    });
  }
  try {
    return await fn();
  } finally {
    unlisten?.();
  }
}

export async function installCursorAgentCliTauri(onLog?: (text: string) => void): Promise<string> {
  return withInstallLog(onLog, () => invoke<string>('cursor_agent_cli_install'));
}

export async function loginCursorAgentCliTauri(onLog?: (text: string) => void): Promise<string> {
  return withInstallLog(onLog, () => invoke<string>('cursor_agent_cli_login'));
}

export async function resolveCursorAgentCliReady(synapseApiBase: string): Promise<boolean> {
  if (IS_TAURI) {
    try {
      const local = await checkCursorAgentCliTauri();
      if (local.ready) return true;
    } catch {
      /* fall through to API */
    }
  }
  try {
    const remote = await fetchCursorAgentCliStatus(synapseApiBase);
    return Boolean(remote.ready ?? (remote.installed && remote.logged_in));
  } catch {
    return false;
  }
}
