import { useStore } from '../store';
import { StepCircle } from './StatusBadge';
import type { StepState } from '../types';

const STEP_ICONS: Record<number, string> = {
  1: '🔧',
  2: '🔑',
  3: '☁',
  4: '⚙',
  5: '📁',
  6: '🚀',
};

export function ProgressSidebar() {
  const { wizard, goToStep } = useStore();

  if (!wizard) return null;

  const { steps, currentStep, stepNames = {} } = wizard;

  return (
    <aside className="w-60 flex-shrink-0 bg-surface-2 border-r border-surface-3 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-surface-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🚀</span>
          <div>
            <div className="font-bold text-sm text-gray-100">BTP Starter</div>
            <div className="text-xs text-gray-500">Setup Wizard</div>
          </div>
        </div>
      </div>

      {/* Steps */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {steps.map((step: StepState) => {
          const isActive = step.id === currentStep;
          // All steps are always clickable — the wizard is a guide, not a gate.
          // Users who ran steps outside the wizard must be able to navigate freely.
          const isDone = step.status === 'completed' || step.status === 'skipped';

          return (
            <button
              key={step.id}
              onClick={() => goToStep(step.id)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
                transition-all duration-150
                ${isActive
                  ? 'bg-sap-blue/20 border border-sap-blue/40 text-gray-100'
                  : isDone
                    ? 'hover:bg-surface-3 border border-transparent text-gray-300 hover:text-gray-100'
                    : 'hover:bg-surface-3 border border-transparent text-gray-500 hover:text-gray-300'
                }
                cursor-pointer
              `}
            >
              <StepCircle
                stepId={step.id}
                status={step.status}
                active={isActive}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500 mb-0.5">
                  {STEP_ICONS[step.id]} Step {step.id}
                </div>
                <div className={`text-sm font-medium truncate ${isActive ? 'text-gray-100' : ''}`}>
                  {stepNames[step.id] ?? `Step ${step.id}`}
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Reset */}
      <div className="px-4 py-4 border-t border-surface-3">
        <button
          onClick={() => useStore.getState().resetWizard()}
          className="btn-ghost w-full text-center text-xs text-gray-500 hover:text-red-400"
        >
          ↺ Reset wizard
        </button>
      </div>
    </aside>
  );
}
