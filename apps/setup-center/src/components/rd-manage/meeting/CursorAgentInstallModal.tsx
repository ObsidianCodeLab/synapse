/**
 * 任务执行前置：Cursor Agent CLI 检测与一键安装弹窗。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Modal, message } from 'antd';
import { Download, Loader2, LogIn, RefreshCw, Terminal } from 'lucide-react';
import {
  checkCursorAgentCliTauri,
  fetchCursorAgentCliStatus,
  installCursorAgentCliTauri,
  loginCursorAgentCliTauri,
  mergeCursorAgentCliStatus,
  type CursorAgentCliStatus,
  type MergedCursorAgentCliStatus,
} from '../../../api/cursorAgentCliService';
import { IS_TAURI } from '../../../platform';

interface Props {
  open: boolean;
  synapseApiBase: string;
  installHint?: string;
  onClose: () => void;
  /** 安装且登录完成后触发（例如重新执行任务执行节点） */
  onReady?: () => void | Promise<void>;
}

export function CursorAgentInstallModal({
  open,
  synapseApiBase,
  installHint,
  onClose,
  onReady,
}: Props) {
  const [status, setStatus] = useState<MergedCursorAgentCliStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [installLog, setInstallLog] = useState('');
  const [error, setError] = useState('');

  const appendLog = useCallback((line: string) => {
    setInstallLog((prev) => prev + line);
  }, []);

  const recheck = useCallback(async () => {
    setChecking(true);
    setError('');
    try {
      let localPartial: Partial<CursorAgentCliStatus> | null = null;
      if (IS_TAURI) {
        try {
          const local = await checkCursorAgentCliTauri();
          localPartial = {
            installed: local.installed,
            logged_in: local.loggedIn,
            ready: local.ready,
            version: local.version ?? null,
            auth_message: local.authMessage ?? undefined,
          };
        } catch {
          /* use API fallback */
        }
      }
      let remote: CursorAgentCliStatus | null = null;
      try {
        remote = await fetchCursorAgentCliStatus(synapseApiBase);
      } catch {
        if (!localPartial) throw new Error('检测失败');
      }
      const next = mergeCursorAgentCliStatus(localPartial, remote);
      setStatus(next);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : '检测失败');
      return null;
    } finally {
      setChecking(false);
    }
  }, [synapseApiBase]);

  useEffect(() => {
    if (!open) return;
    setInstallLog('');
    setError('');
    void recheck();
  }, [open, recheck]);

  const installed = Boolean(status?.installed);
  const loggedIn = Boolean(status?.logged_in);
  const ready = Boolean(status?.ready);
  const localInstalled = Boolean(status?.local_installed ?? status?.installed);
  const localLoggedIn = Boolean(status?.local_logged_in ?? status?.logged_in);
  const backendMismatch = Boolean(status?.backend_mismatch);
  const canInstall = IS_TAURI && !localInstalled && !installing && !loggingIn;
  const canLogin = IS_TAURI && localInstalled && !localLoggedIn && !installing && !loggingIn;

  const hintText = useMemo(() => {
    if (installHint?.trim()) return installHint.trim();
    if (status?.install_hint?.trim()) return status.install_hint.trim();
    return '任务执行依赖 Cursor Agent CLI（agent 命令），与 Cursor 编辑器自带的 cursor 命令不同。';
  }, [installHint, status?.install_hint]);

  const startLogin = useCallback(async () => {
    if (!IS_TAURI) {
      message.warning('请在 Synapse 桌面版中登录');
      return false;
    }
    setLoggingIn(true);
    setError('');
    try {
      const msg = await loginCursorAgentCliTauri(appendLog);
      message.success(msg || '登录成功');
      const next = await recheck();
      return Boolean(next?.ready);
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setError(text);
      message.warning(text);
      await recheck();
      return false;
    } finally {
      setLoggingIn(false);
    }
  }, [appendLog, recheck]);

  const onInstall = async () => {
    if (!IS_TAURI) {
      message.warning('请在 Synapse 桌面版中使用一键安装');
      return;
    }
    setInstalling(true);
    setInstallLog('');
    setError('');
    try {
      const msg = await installCursorAgentCliTauri(appendLog);
      message.success(msg || '安装完成');
      const next = await recheck();
      if (next?.installed && !next.ready) {
        await startLogin();
      }
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setError(text);
      message.error(text);
    } finally {
      setInstalling(false);
    }
  };

  const onContinue = async () => {
    if (!ready) {
      message.warning(
        backendMismatch
          ? 'Synapse 后端尚未识别 agent，请重启 Synapse 服务后点击「重新检测」'
          : '请先完成安装与 Cursor 账号登录',
      );
      return;
    }
    await onReady?.();
  };

  return (
    <Modal
      open={open}
      title={
        <span className="inline-flex items-center gap-2">
          <Terminal className="h-4 w-4 text-amber-400" />
          Cursor Agent CLI 安装与登录
        </span>
      }
      onCancel={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>稍后</Button>
          <Button icon={<RefreshCw className="h-4 w-4" />} loading={checking} onClick={() => void recheck()}>
            重新检测
          </Button>
          {canInstall ? (
            <Button
              type="primary"
              icon={installing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              loading={installing}
              onClick={() => void onInstall()}
            >
              一键安装
            </Button>
          ) : null}
          {canLogin ? (
            <Button
              type="primary"
              icon={loggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              loading={loggingIn}
              onClick={() => void startLogin()}
            >
              登录 Cursor 账号
            </Button>
          ) : null}
          {ready ? (
            <Button
              type="primary"
              className="bg-emerald-600 hover:bg-emerald-500"
              onClick={() => void onContinue()}
            >
              已就绪，继续
            </Button>
          ) : null}
        </div>
      }
      width={640}
      destroyOnClose
    >
      <div className="space-y-4">
        <Alert
          type={ready ? 'success' : installed ? 'info' : 'warning'}
          showIcon
          message={
            ready
              ? `Cursor Agent CLI 已就绪${status?.version ? `（${status.version}）` : ''}`
              : installed
                ? `已安装 agent${status?.version ? `（${status.version}）` : ''}，等待登录`
                : '未检测到 Cursor Agent CLI（agent）'
          }
          description={
            ready
              ? status?.auth_message || '可以继续执行任务。'
              : installed
                ? '安装完成后将自动打开浏览器完成 OAuth 登录；若未弹出，请点击「登录 Cursor 账号」。'
                : '任务执行节点会在开始前自动检测；安装完成后会自动引导登录。'
          }
        />

        {!installed ? (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-[12px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {hintText}
          </div>
        ) : null}

        {backendMismatch ? (
          <Alert
            type="warning"
            showIcon
            message="桌面端已检测到 agent，Synapse 后端尚未识别"
            description="任务执行由 Synapse 后端进程调用 agent。请重启 Synapse 服务（或新开终端后再启动 synapse serve），然后点击「重新检测」。"
          />
        ) : null}

        {!IS_TAURI && !installed ? (
          <Alert
            type="info"
            showIcon
            message="浏览器模式无法一键安装"
            description="请在本机 PowerShell 执行：irm 'https://cursor.com/install?win32=true' | iex，然后 agent login"
          />
        ) : null}

        {error ? <Alert type="error" showIcon message={error} /> : null}

        {installLog ? (
          <pre className="max-h-40 overflow-auto rounded-lg border border-border/50 bg-black/30 p-3 text-[10px] leading-relaxed text-zinc-300 custom-scrollbar">
            {installLog}
          </pre>
        ) : null}
      </div>
    </Modal>
  );
}
