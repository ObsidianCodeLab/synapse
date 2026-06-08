import React from 'react';
import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import type {
  MeetingAgentProfile,
  MeetingSkillCard,
  SkillValidationResult,
} from './meetingRoomSkillConfig';

export type { MeetingSkillCard };

export const MeetingAgentSkillCards: React.FC<{
  agent: MeetingAgentProfile;
  skills: MeetingSkillCard[];
  validation?: SkillValidationResult | null;
  variant?: 'host' | 'worker';
  skillsModeAll?: boolean;
}> = ({ agent, skills, validation, variant = 'worker', skillsModeAll = false }) => {
  const tone = variant === 'host' ? 'indigo' : 'emerald';
  const hasIssues = validation && !validation.ok;

  return (
    <div className={`rd-meeting-agent-skill-panel rd-meeting-agent-skill-panel--${tone}`}>
      <div className="rd-meeting-agent-skill-panel__hero">
        <div
          className="rd-meeting-agent-skill-panel__avatar"
          style={{ backgroundColor: agent.color || '#4A90D9' }}
        >
          <span>{agent.icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground m-0">{agent.name}</h4>
            <span className={`rd-meeting-agent-skill-panel__badge rd-meeting-agent-skill-panel__badge--${tone}`}>
              {variant === 'host' ? '会议主持' : '协作专家'}
            </span>
            {skillsModeAll ? (
              <span className="text-[10px] text-muted-foreground border border-border/50 rounded px-1.5 py-0">
                全部技能模式
              </span>
            ) : null}
          </div>
          {agent.description ? (
            <p className="text-[11px] text-muted-foreground mt-1 mb-0 leading-relaxed line-clamp-2">
              {agent.description}
            </p>
          ) : null}
        </div>
        {validation ? (
          validation.ok ? (
            <span className="rd-meeting-agent-skill-panel__status rd-meeting-agent-skill-panel__status--ok shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5" />
              技能就绪
            </span>
          ) : (
            <span className="rd-meeting-agent-skill-panel__status rd-meeting-agent-skill-panel__status--warn shrink-0">
              <AlertCircle className="h-3.5 w-3.5" />
              待补齐
            </span>
          )
        ) : null}
      </div>

      {hasIssues && validation ? (
        <ul className="rd-meeting-agent-skill-panel__issues">
          {validation.issues.map((issue) => (
            <li key={issue.displayName}>
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>缺少「{issue.displayName}」（未绑定到该智能体 Profile）</span>
            </li>
          ))}
        </ul>
      ) : null}

      {skills.length === 0 ? (
        <p className="text-[11px] text-muted-foreground m-0 px-1">暂未配置可展示的技能</p>
      ) : (
        <div className="rd-meeting-agent-skill-grid">
          {skills.map((skill) => (
            <article
              key={skill.skillId}
              className={`rd-meeting-skill-card rd-meeting-skill-card--${tone}`}
            >
              <div className="rd-meeting-skill-card__glow" aria-hidden />
              <div className="rd-meeting-skill-card__head">
                <Sparkles className="h-3.5 w-3.5 shrink-0 opacity-80" />
                <span className="rd-meeting-skill-card__title">{skill.label}</span>
              </div>
              <p className="rd-meeting-skill-card__desc">{skill.description}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
