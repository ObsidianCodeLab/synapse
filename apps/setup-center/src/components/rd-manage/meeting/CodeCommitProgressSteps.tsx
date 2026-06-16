import React from 'react';
import { CheckCircle2, CircleDashed, Loader2, XCircle } from 'lucide-react';

import {
  CODE_COMMIT_STEPS,
  type CodeCommitStepId,
  type StepVisualState,
} from './codeCommitDisplay';

function stepIcon(state: StepVisualState) {
  if (state === 'active') return <Loader2 className="h-4 w-4 animate-spin" />;
  if (state === 'ok') return <CheckCircle2 className="h-4 w-4" />;
  if (state === 'failed') return <XCircle className="h-4 w-4" />;
  if (state === 'partial') return <CheckCircle2 className="h-4 w-4 opacity-70" />;
  return <CircleDashed className="h-4 w-4 opacity-50" />;
}

function stepClass(state: StepVisualState): string {
  if (state === 'active') return 'rd-code-commit-step--active';
  if (state === 'ok') return 'rd-code-commit-step--ok';
  if (state === 'failed') return 'rd-code-commit-step--failed';
  if (state === 'partial') return 'rd-code-commit-step--partial';
  return 'rd-code-commit-step--pending';
}

export function CodeCommitProgressSteps({
  stepStates,
}: {
  stepStates: Record<CodeCommitStepId, StepVisualState>;
}) {
  return (
    <ol className="rd-code-commit-steps">
      {CODE_COMMIT_STEPS.map((step, index) => {
        const state = stepStates[step.id];
        return (
          <li key={step.id} className={`rd-code-commit-step ${stepClass(state)}`}>
            {index > 0 ? <span className="rd-code-commit-step__connector" aria-hidden /> : null}
            <div className="rd-code-commit-step__icon">{stepIcon(state)}</div>
            <div className="rd-code-commit-step__body">
              <span className="rd-code-commit-step__label">{step.label}</span>
              <span className="rd-code-commit-step__subtitle">{step.subtitle}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
