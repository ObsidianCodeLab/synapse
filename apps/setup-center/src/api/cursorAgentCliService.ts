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

export interface MergedCursorAgentCliStatus extends CursorAgentCliStatus {
  /** 桌面端（Tauri）本地检测结果，用于一键安装/登录按钮 */
  local_installed?: boolean;
  local_logged_in?: boolean;
  local_ready?: boolean;
  /** 桌面端已就绪但 Synapse 后端尚未识别 agent */
  backend_mismatch?: boolean;
}

/** 合并 Tauri 本地与 Synapse 后端检测结果；任务执行在后端进程，ready 以后端为准。 */
export function mergeCursorAgentCliStatus(
  local: Partial<CursorAgentCliStatus> | null,
  remote: CursorAgentCliStatus | null,
): MergedCursorAgentCliStatus | null {
  if (!local && !remote) return null;

  const localInstalled = Boolean(local?.installed);
  const localLoggedIn = Boolean(local?.logged_in);
  const localReady = Boolean(local?.ready ?? (localInstalled && localLoggedIn));

  const remoteInstalled = remote ? Boolean(remote.installed) : false;
  const remoteLoggedIn = remote ? Boolean(remote.logged_in) : false;
  const remoteReady = remote
    ? Boolean(remote.ready ?? (remoteInstalled && remoteLoggedIn))
    : false;

  const useRemote = remote != null;
  const installed = useRemote ? remoteInstalled : localInstalled;
  const loggedIn = useRemote ? remoteLoggedIn : localLoggedIn;
  const ready = useRemote ? remoteReady : localReady;
  const backendMismatch = useRemote && localReady && !remoteReady;

  return {
    installed,
    logged_in: loggedIn,
    ready,
    path: remote?.path ?? local?.path,
    version: remote?.version ?? local?.version ?? null,
    auth_message: remote?.auth_message ?? local?.auth_message,
    error: remote?.error ?? local?.error,
    install_hint: remote?.install_hint ?? local?.install_hint,
    platform: remote?.platform ?? local?.platform,
    local_installed: local ? localInstalled : undefined,
    local_logged_in: local ? localLoggedIn : undefined,
    local_ready: local ? localReady : undefined,
    backend_mismatch: backendMismatch,
  };
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
  try {
    const remote = await fetchCursorAgentCliStatus(synapseApiBase);
    return Boolean(remote.ready ?? (remote.installed && remote.logged_in));
  } catch {
    if (!IS_TAURI) return false;
    try {
      const local = await checkCursorAgentCliTauri();
      return local.ready;
    } catch {
      return false;
    }
  }
}
