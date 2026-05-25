import type { StepStatus } from '../types';

interface StatusBadgeProps {
  status: StepStatus;
  small?: boolean;
}

const CONFIG: Record<StepStatus, { label: string; className: string; icon: string }> = {
  pending:   { label: 'Pending',   className: 'bg-surface-3 text-gray-400',                  icon: '○' },
  running:   { label: 'Running',   className: 'bg-blue-900/50 text-blue-300 border-blue-700', icon: '●' },
  completed: { label: 'Done',      className: 'bg-green-900/50 text-green-300',               icon: '✓' },
  error:     { label: 'Error',     className: 'bg-red-900/50 text-red-300',                   icon: '✗' },
  skipped:   { label: 'Skipped',   className: 'bg-yellow-900/30 text-yellow-400',             icon: '–' },
};

export function StatusBadge({ status, small = false }: StatusBadgeProps) {
  const { label, className, icon } = CONFIG[status];
  const isRunning = status === 'running';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-transparent font-medium
        ${small ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'} ${className}`}
    >
      {isRunning ? (
        <span className="spinner" style={{ width: small ? 10 : 12, height: small ? 10 : 12 }} />
      ) : (
        <span>{icon}</span>
      )}
      {label}
    </span>
  );
}

/** Circle indicator used in the sidebar */
export function StepCircle({
  stepId,
  status,
  active,
}: {
  stepId: number;
  status: StepStatus;
  active: boolean;
}) {
  const base = 'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all duration-200';

  if (status === 'completed') {
    return <div className={`${base} bg-green-600 text-white`}>✓</div>;
  }
  if (status === 'error') {
    return <div className={`${base} bg-red-600 text-white`}>✗</div>;
  }
  if (status === 'skipped') {
    // Amber/yellow — done outside the wizard
    return <div className={`${base} bg-yellow-700/70 text-yellow-200`} title="Skipped — completed outside wizard">–</div>;
  }
  if (status === 'running') {
    return (
      <div className={`${base} bg-sap-blue text-white`}>
        <span className="spinner pulse-dot" style={{ width: 14, height: 14 }} />
      </div>
    );
  }
  if (active) {
    return <div className={`${base} bg-sap-blue text-white ring-2 ring-sap-blue/40`}>{stepId}</div>;
  }
  return <div className={`${base} bg-surface-3 text-gray-400`}>{stepId}</div>;
}
