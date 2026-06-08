import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Tooltip } from 'antd';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  Coffee,
  Cpu,
  Server,
} from 'lucide-react';
import type { RoomAgent } from './meetingChatTypes';
import type { MeetingChatLog } from './meetingChatUtils';

export const HOST_PROFILE_ID = 'default';

export const SYSTEM_AGENT: RoomAgent = {
  id: 'system',
  name: '系统',
  role: '流程编排',
  avatarColor: 'bg-slate-600',
  icon: <Server className="w-3.5 h-3.5" />,
  status: 'idle',
  currentAction: '流程日志',
};

const AgentStatusIcon = ({ status }: { status: RoomAgent['status'] }) => {
  switch (status) {
    case 'processing':
      return <BrainCircuit className="w-3 h-3 text-blue-400 animate-pulse" />;
    case 'idle':
      return <Coffee className="w-3 h-3 text-muted-foreground" />;
    case 'error':
      return <AlertTriangle className="w-3 h-3 text-red-400" />;
  }
};

export function MeetingAgentAvatar({
  agent,
  size = 'normal',
  showStatusBadge = true,
  showHoverName = false,
  onClick,
}: {
  agent: RoomAgent;
  size?: 'small' | 'normal' | 'large';
  showStatusBadge?: boolean;
  /** 悬停时在头像下方浮动展示智能体名称（portal，避免被 overflow 裁剪） */
  showHoverName?: boolean;
  onClick?: () => void;
}) {
  const isLarge = size === 'large';
  const sizeClasses = isLarge ? 'w-10 h-10' : size === 'small' ? 'w-7 h-7' : 'w-8 h-8';
  const [hoverTip, setHoverTip] = useState<{ x: number; y: number } | null>(null);

  const handleClick = onClick
    ? (e: React.MouseEvent) => {
        e.stopPropagation();
        onClick();
      }
    : undefined;

  const hoverSubtitle = onClick ? '点击查看上下文' : agent.role;

  const content = (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `查看 ${agent.name} 上下文` : showHoverName ? agent.name : undefined}
      onClick={handleClick}
      onMouseEnter={
        showHoverName
          ? (e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setHoverTip({ x: rect.left + rect.width / 2, y: rect.bottom + 6 });
            }
          : undefined
      }
      onMouseLeave={showHoverName ? () => setHoverTip(null) : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onClick();
              }
            }
          : undefined
      }
      className={`relative inline-flex shrink-0 outline-none ${
        onClick
          ? 'cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 hover:scale-105 focus-visible:ring-2 focus-visible:ring-blue-500/60 rounded-full'
          : ''
      }`}
    >
      <div
        className={`${sizeClasses} rounded-full flex items-center justify-center text-white ${agent.avatarColor} border-2 border-background shadow-lg relative z-10 overflow-hidden`}
      >
        {agent.status === 'processing' && (
          <motion.div
            className="absolute inset-0 bg-white/20"
            animate={{ y: ['100%', '-100%'] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
          />
        )}
        {agent.icon ?? <Bot className="w-3.5 h-3.5" />}
      </div>

      {showStatusBadge ? (
        <div
          className={`absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background z-20 ${
            agent.status === 'processing'
              ? 'bg-blue-900'
              : agent.status === 'error'
                ? 'bg-red-900'
                : 'bg-muted'
          }`}
        >
          <AgentStatusIcon status={agent.status} />
          {agent.status === 'processing' && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-50" />
          )}
          {agent.status === 'error' && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-40" />
          )}
        </div>
      ) : null}
    </div>
  );

  if (showHoverName) {
    return (
      <>
        {content}
        {hoverTip
          ? createPortal(
              <div
                className="agentOrbitTooltip agentOrbitTooltipVisible"
                style={{ left: hoverTip.x, top: hoverTip.y }}
              >
                <span className="agentOrbitTooltipName">{agent.name}</span>
                {hoverSubtitle ? (
                  <span className="agentOrbitTooltipTitle">{hoverSubtitle}</span>
                ) : null}
              </div>,
              document.body,
            )
          : null}
      </>
    );
  }

  if (!onClick) return content;
  return <Tooltip title={`${agent.name} · 点击查看上下文`}>{content}</Tooltip>;
}

/** 将 history 中的 agentId / speakerRole 映射到当前会议室 roster */
export function resolveLogAgent(
  agents: RoomAgent[],
  agentId: string,
  log?: Pick<MeetingChatLog, 'speakerRole' | 'displayKind'>,
): RoomAgent | undefined {
  if (agentId === 'user' || log?.speakerRole === 'user') return undefined;
  if (log?.speakerRole === 'system' || agentId === 'system') return SYSTEM_AGENT;
  if (!agents.length) {
    if (log?.speakerRole === 'host' || agentId === HOST_PROFILE_ID || agentId === 'host') {
      return { ...SYSTEM_AGENT, id: HOST_PROFILE_ID, name: '小鲸', icon: <Bot className="w-3.5 h-3.5" />, avatarColor: 'bg-violet-500' };
    }
    return undefined;
  }
  const id = (agentId || '').trim();
  if (log?.speakerRole === 'worker' && id) {
    const w = agents.find((a) => a.id === id);
    if (w) return w;
    return stubWorkerAgent(id);
  }
  const direct = agents.find((a) => a.id === id);
  if (direct) return direct;
  if (log?.speakerRole === 'host' || id === 'host' || id === HOST_PROFILE_ID || !id) {
    return agents.find((a) => a.id === HOST_PROFILE_ID) ?? agents[0];
  }
  if (id) return agents.find((a) => a.id === id) ?? stubWorkerAgent(id);
  return agents.find((a) => a.id === HOST_PROFILE_ID) ?? agents[0];
}

/** 系统/流程类消息默认展示主持头像 */
export function fallbackHostAgent(agents: RoomAgent[]): RoomAgent | undefined {
  if (!agents.length) return undefined;
  return agents.find((a) => a.id === HOST_PROFILE_ID) ?? agents[0];
}

export function workerColor(profileId: string): string {
  const colors = [
    'bg-sky-500',
    'bg-indigo-500',
    'bg-teal-500',
    'bg-cyan-500',
    'bg-emerald-500',
  ];
  let h = 0;
  for (let i = 0; i < profileId.length; i++) h = (h + profileId.charCodeAt(i)) % colors.length;
  return colors[h] ?? 'bg-sky-500';
}

export function stubWorkerAgent(profileId: string, displayName?: string): RoomAgent {
  const label = (displayName || '').trim();
  return {
    id: profileId,
    name: label && label !== profileId ? label : '协作智能体',
    role: '协作智能体',
    avatarColor: workerColor(profileId),
    icon: <Cpu className="w-3 h-3" />,
    status: 'idle',
    currentAction: '待命',
  };
}
