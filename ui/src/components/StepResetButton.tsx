/**
 * StepResetButton — appears in the top-right corner of each step.
 * Calls the backend reset endpoint and clears the step status to pending.
 */

import { useState } from 'react';
import { useStore } from '../store';

interface Props {
  stepId: number;
  /** Extra payload for step 5 (project directory to delete) */
  projectDir?: string;
  /** Custom label shown before the user confirms */
  confirmLabel?: string;
  disabled?: boolean;
}

export function StepResetButton({ stepId, projectDir, confirmLabel, disabled }: Props) {
  const { resetStep } = useStore();
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [actions, setActions] = useState<string[]>([]);
  const [showActions, setShowActions] = useState(false);

  const handleClick = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    void doReset();
  };

  const doReset = async () => {
    setResetting(true);
    setConfirming(false);
    try {
      const result = await resetStep(stepId, projectDir ? projectDir : undefined);
      // result is WizardState & { actions } — resetStep in store calls api.resetStep
      // The store already updates wizard state. Here we just show the action log.
      const anyResult = result as unknown as { actions?: string[] };
      if (anyResult?.actions) {
        setActions(anyResult.actions);
        setShowActions(true);
        setTimeout(() => setShowActions(false), 5000);
      }
    } catch {
      // Ignore — store handles fallback
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={disabled || resetting}
        className={`
          text-xs px-2.5 py-1 rounded border transition-all duration-150
          ${confirming
            ? 'border-red-500 bg-red-900/20 text-red-400 hover:bg-red-900/30'
            : 'border-surface-4 bg-surface-3 text-gray-500 hover:text-red-400 hover:border-red-600/50'
          }
          disabled:opacity-40
        `}
      >
        {resetting ? (
          <span className="flex items-center gap-1">
            <span className="spinner" style={{ width: 10, height: 10 }} /> Resetting...
          </span>
        ) : confirming ? (
          confirmLabel ?? '⚠ Confirm reset?'
        ) : (
          '↺ Reset step'
        )}
      </button>

      {confirming && !resetting && (
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-gray-600 hover:text-gray-400"
        >
          Cancel
        </button>
      )}

      {showActions && actions.length > 0 && (
        <div className="text-xs text-gray-500 text-right space-y-0.5">
          {actions.map((a, i) => <div key={i}>{a}</div>)}
        </div>
      )}
    </div>
  );
}
