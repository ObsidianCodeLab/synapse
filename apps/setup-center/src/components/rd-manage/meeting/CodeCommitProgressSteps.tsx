import React from 'react';
import { Check, Circle, Loader2, X } from 'lucide-react';

import {
  CODE_COMMIT_STEPS,
  type CodeCommitStepId,
  type StepVisualState,
} from './codeCommitDisplay';

const STEP_STATE_LABEL: Record<StepVisualState, string> = {
  pending: '未开始',
  active: '进行中',
  ok: '已完成',
  failed: '已失败',
};

function stepIcon(state: StepVisualState) {
  if (state === 'active') {
    return <Loader2 className="h-4 w-4 animate-spin text-amber-400" aria-hidden />;
  }
  if (state === 'ok') {
    return <Check className="h-4 w-4 text-emerald-400" strokeWidth={2.5} aria-hidden />;
  }
  if (state === 'failed') {
    return <X className="h-4 w-4 text-red-400" strokeWidth={2.5} aria-hidden />;
  }
  return <Circle className="h-3.5 w-3.5 text-slate-500" aria-hidden />;
}

function stepClass(state: StepVisualState): string {
  if (state === 'active') return 'rd-code-commit-step--active';
  if (state === 'ok') return 'rd-code-commit-step--ok';
  if (state === 'failed') return 'rd-code-commit-step--failed';
  return 'rd-code-commit-step--pending';
}

export function CodeCommitProgressSteps({
  stepStates,
}: {
  stepStates: Record<CodeCommitStepId, StepVisualState>;
}) {
  return (
    <ol className="rd-code-commit-steps">
      {CODE_COMMIT_STEPS.map((step) => {
        const state = stepStates[step.id];
        return (
          <li
            key={step.id}
            className={`rd-code-commit-step ${stepClass(state)}`}
            aria-label={`${step.label}：${STEP_STATE_LABEL[state]}`}
          >
            <div className="rd-code-commit-step__icon">{stepIcon(state)}</div>
            <div className="rd-code-commit-step__body">
              <span className="rd-code-commit-step__label">{step.label}</span>
              <span className="rd-code-commit-step__subtitle">{STEP_STATE_LABEL[state]}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
