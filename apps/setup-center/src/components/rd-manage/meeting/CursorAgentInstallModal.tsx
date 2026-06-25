/**
 * 任务执行前置：Cursor Agent CLI 检测与一键安装弹窗。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Modal, message } from 'antd';
import { Download, Loader2, LogIn, RefreshCw, Terminal } from 'lucide-react';
import {
  CursorAgentInstallLogPanel,
  type CursorAgentInstallPhase,
} from '../../cursor-agent/CursorAgentInstallLogPanel';
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

function versionSuffix(version: string | null | undefined): string {
  return version ? `（${version}）` : '';
}

export function CursorAgentInstallModal({
  open,
  synapseApiBase,
  installHint,
  onClose,
  onReady,
}: Props) {
  const { t } = useTranslation();
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
        if (!localPartial) throw new Error(t('cursorAgentCli.modal.checkFailed'));
      }
      const next = mergeCursorAgentCliStatus(localPartial, remote);
      setStatus(next);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : t('cursorAgentCli.modal.checkFailed'));
      return null;
    } finally {
      setChecking(false);
    }
  }, [synapseApiBase, t]);

  useEffect(() => {
    if (!open) return;
    setInstallLog('');
    setError('');
    void recheck();
  }, [open, recheck]);

  const installed = Boolean(status?.installed);
  const ready = Boolean(status?.ready);
  const localInstalled = Boolean(status?.local_installed ?? status?.installed);
  const localLoggedIn = Boolean(status?.local_logged_in ?? status?.logged_in);
  const backendMismatch = Boolean(status?.backend_mismatch);
  const canInstall = IS_TAURI && !localInstalled && !installing && !loggingIn;
  const canLogin = IS_TAURI && localInstalled && !localLoggedIn && !installing && !loggingIn;

  const logPhase: CursorAgentInstallPhase = installing
    ? 'install'
    : loggingIn
      ? 'login'
      : installLog.trim()
        ? 'idle'
        : 'idle';

  const hintText = useMemo(() => {
    if (installHint?.trim()) return installHint.trim();
    if (status?.install_hint?.trim()) return status.install_hint.trim();
    return t('cursorAgentCli.modal.defaultHint');
  }, [installHint, status?.install_hint, t]);

  const startLogin = useCallback(async () => {
    if (!IS_TAURI) {
      message.warning(t('cursorAgentCli.modal.loginDesktopOnly'));
      return false;
    }
    setLoggingIn(true);
    setError('');
    try {
      appendLog(t('cursorAgentCli.modal.loginStartLog'));
      const msg = await loginCursorAgentCliTauri(appendLog);
      message.success(msg || t('cursorAgentCli.modal.loginSuccess'));
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
  }, [appendLog, recheck, t]);

  const onInstall = async () => {
    if (!IS_TAURI) {
      message.warning(t('cursorAgentCli.modal.installDesktopOnly'));
      return;
    }
    setInstalling(true);
    setInstallLog('');
    setError('');
    appendLog(t('cursorAgentCli.modal.installStartLog'));
    try {
      const msg = await installCursorAgentCliTauri(appendLog);
      if (msg?.trim()) appendLog(`${msg.trim()}\n`);
      message.success(msg || t('cursorAgentCli.modal.installDone'));
      const next = await recheck();
      const needsLocalLogin = Boolean(next?.local_installed ?? next?.installed)
        && !Boolean(next?.local_logged_in ?? next?.logged_in);
      if (needsLocalLogin) {
        await startLogin();
      } else if (next?.backend_mismatch && next?.local_logged_in) {
        appendLog(t('cursorAgentCli.modal.backendMismatchLoggedInLog'));
      }
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      const next = await recheck();
      if (next?.installed) {
        message.warning(t('cursorAgentCli.modal.installPartialWarning', { error: text }));
        const needsLocalLogin = Boolean(next?.local_installed ?? next?.installed)
          && !Boolean(next?.local_logged_in ?? next?.logged_in);
        if (needsLocalLogin) {
          await startLogin();
        }
      } else {
        setError(text);
        message.error(text);
      }
    } finally {
      setInstalling(false);
    }
  };

  const onContinue = async () => {
    if (!ready) {
      message.warning(
        backendMismatch
          ? t('cursorAgentCli.modal.continueBackendMismatch')
          : t('cursorAgentCli.modal.continueNeedLogin'),
      );
      return;
    }
    await onReady?.();
  };

  return (
    <Modal
      open={open}
      title={
        <span className="inline-flex items-center gap-2 text-foreground">
          <Terminal className="h-4 w-4 shrink-0 opacity-80" />
          {t('cursorAgentCli.modal.title')}
        </span>
      }
      onCancel={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>{t('cursorAgentCli.modal.later')}</Button>
          <Button icon={<RefreshCw className="h-4 w-4" />} loading={checking} onClick={() => void recheck()}>
            {t('cursorAgentCli.modal.recheck')}
          </Button>
          {canInstall ? (
            <Button
              type="primary"
              icon={installing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              loading={installing}
              onClick={() => void onInstall()}
            >
              {t('cursorAgentCli.modal.install')}
            </Button>
          ) : null}
          {canLogin ? (
            <Button
              type="primary"
              icon={loggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              loading={loggingIn}
              onClick={() => void startLogin()}
            >
              {t('cursorAgentCli.modal.login')}
            </Button>
          ) : null}
          {ready ? (
            <Button type="primary" onClick={() => void onContinue()}>
              {t('cursorAgentCli.modal.continue')}
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
              ? t('cursorAgentCli.modal.statusReady', { version: versionSuffix(status?.version) })
              : installed
                ? t('cursorAgentCli.modal.statusInstalledWaitLogin', { version: versionSuffix(status?.version) })
                : t('cursorAgentCli.modal.statusNotDetected')
          }
          description={
            ready
              ? status?.auth_message || t('cursorAgentCli.modal.descReady')
              : installed
                ? t('cursorAgentCli.modal.descInstalled')
                : t('cursorAgentCli.modal.descNotDetected')
          }
        />

        {!installed ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-[12px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {hintText}
          </div>
        ) : null}

        {backendMismatch ? (
          <Alert
            type="warning"
            showIcon
            message={
              status?.backend_auth_gap
                ? t('cursorAgentCli.modal.backendAuthGapTitle')
                : t('cursorAgentCli.modal.backendMismatchTitle')
            }
            description={
              status?.backend_auth_gap
                ? t('cursorAgentCli.modal.backendAuthGapDesc')
                : t('cursorAgentCli.modal.backendMismatchDesc')
            }
          />
        ) : null}

        {!IS_TAURI && !installed ? (
          <Alert
            type="info"
            showIcon
            message={t('cursorAgentCli.modal.webInstallTitle')}
            description={t('cursorAgentCli.modal.webInstallDesc')}
          />
        ) : null}

        {error ? <Alert type="error" showIcon message={error} /> : null}

        <CursorAgentInstallLogPanel
          phase={logPhase}
          log={installLog}
          emptyHint={
            installing
              ? t('cursorAgentCli.logPanel.waitingInstallOutput')
              : loggingIn
                ? t('cursorAgentCli.logPanel.waitingLoginOutput')
                : undefined
          }
        />
      </div>
    </Modal>
  );
}
