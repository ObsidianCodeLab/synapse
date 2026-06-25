/**
 * Cursor Agent CLI 安装/登录实时日志（与引导页 obClaudeLogBox 主题一致）。
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Progress } from 'antd';
import { Loader2 } from 'lucide-react';
import { parseCursorAgentInstallPercent } from './parseCursorAgentInstallPercent';

export type CursorAgentInstallPhase = 'idle' | 'install' | 'login';

export { parseCursorAgentInstallPercent };

interface Props {
  phase: CursorAgentInstallPhase;
  log: string;
  /** 无解析进度时是否显示 indeterminate 进度条 */
  showProgress?: boolean;
  title?: string;
  emptyHint?: string;
  className?: string;
}

export function CursorAgentInstallLogPanel({
  phase,
  log,
  showProgress = true,
  title,
  emptyHint,
  className = '',
}: Props) {
  const { t } = useTranslation();
  const logRef = useRef<HTMLPreElement>(null);
  const active = phase === 'install' || phase === 'login';
  const percent = useMemo(() => parseCursorAgentInstallPercent(log), [log]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [log]);

  if (!active && !log.trim()) return null;

  const headTitle =
    title ??
    (phase === 'install'
      ? t('cursorAgentCli.logPanel.titleInstall')
      : phase === 'login'
        ? t('cursorAgentCli.logPanel.titleLogin')
        : t('cursorAgentCli.logPanel.titleIdle'));

  return (
    <div className={`obClaudeLogBox ${className}`.trim()}>
      <div className="obClaudeLogHead">
        <span className="obClaudeLogHeadDots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        <span className="inline-flex items-center gap-1.5 min-w-0">
          {active ? <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden /> : null}
          <span className="truncate">{headTitle}</span>
        </span>
      </div>
      {showProgress && active ? (
        <div className="px-3 pt-3 pb-1">
          {percent != null ? (
            <Progress percent={percent} status="active" strokeColor="var(--brand)" />
          ) : (
            <Progress percent={100} status="active" showInfo={false} strokeColor="var(--brand)" />
          )}
        </div>
      ) : null}
      <pre ref={logRef} className="obClaudeLogPre">
        {log.trim() || emptyHint || (active ? t('cursorAgentCli.logPanel.waitingOutput') : '')}
      </pre>
    </div>
  );
}
