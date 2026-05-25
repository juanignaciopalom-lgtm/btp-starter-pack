import { useState } from 'react';

interface GuideStep {
  text: string;
  bold?: boolean;
}

interface ManualGuideProps {
  title: string;
  description?: string;
  steps: (string | GuideStep)[];
  link: string;
  linkLabel?: string;
  /** If true, show the guide expanded by default */
  defaultOpen?: boolean;
  /** Variant: 'warning' (yellow), 'info' (blue), 'error' (red) */
  variant?: 'warning' | 'info' | 'error';
  /** Optional: button to re-check after manual action */
  onVerify?: () => void;
  verifyLabel?: string;
}

const VARIANT_STYLES = {
  warning: {
    border: 'border-yellow-700/50',
    bg: 'bg-yellow-900/20',
    icon: '⚠',
    iconColor: 'text-yellow-400',
    titleColor: 'text-yellow-300',
    headerBg: 'hover:bg-yellow-900/30',
  },
  info: {
    border: 'border-blue-700/50',
    bg: 'bg-blue-900/20',
    icon: 'ℹ',
    iconColor: 'text-blue-400',
    titleColor: 'text-blue-300',
    headerBg: 'hover:bg-blue-900/30',
  },
  error: {
    border: 'border-red-700/50',
    bg: 'bg-red-900/20',
    icon: '✗',
    iconColor: 'text-red-400',
    titleColor: 'text-red-300',
    headerBg: 'hover:bg-red-900/30',
  },
};

export function ManualGuide({
  title,
  description,
  steps,
  link,
  linkLabel = 'Open in BTP Cockpit',
  defaultOpen = false,
  variant = 'warning',
  onVerify,
  verifyLabel = 'Check if done ↺',
}: ManualGuideProps) {
  const [open, setOpen] = useState(defaultOpen);
  const s = VARIANT_STYLES[variant];

  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} overflow-hidden`}>
      {/* Header — always visible */}
      <button
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${s.headerBg}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={`text-lg ${s.iconColor}`}>{s.icon}</span>
        <span className={`font-semibold text-sm ${s.titleColor} flex-1`}>{title}</span>
        <span className="text-gray-500 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {/* Body — collapsible */}
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3">
          {description && (
            <p className="text-sm text-gray-300 leading-relaxed">{description}</p>
          )}

          {/* Step-by-step instructions */}
          <ol className="space-y-2">
            {steps.map((step, i) => {
              const text = typeof step === 'string' ? step : step.text;
              const bold = typeof step === 'string' ? false : (step.bold ?? false);
              return (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="text-gray-500 font-mono w-5 text-right flex-shrink-0">{i + 1}.</span>
                  <span className={`text-gray-200 leading-relaxed ${bold ? 'font-semibold' : ''}`}>
                    {text}
                  </span>
                </li>
              );
            })}
          </ol>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-1">
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-sm py-2 px-4 no-underline"
            >
              ↗ {linkLabel}
            </a>
            {onVerify && (
              <button
                onClick={onVerify}
                className="btn-secondary text-sm py-2 px-4"
              >
                {verifyLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
