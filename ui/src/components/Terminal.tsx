import { useEffect, useRef } from 'react';

interface TerminalProps {
  lines: string[];
  className?: string;
  minHeight?: string;
}

/**
 * Read-only terminal output component.
 * Auto-scrolls to the bottom as new lines arrive.
 */
export function Terminal({ lines, className = '', minHeight = '120px' }: TerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  if (lines.length === 0) return null;

  return (
    <div
      className={`terminal-output ${className}`}
      style={{ minHeight }}
      aria-label="Terminal output"
      role="log"
      aria-live="polite"
    >
      {lines.map((line, i) => (
        <div key={i} className="whitespace-pre-wrap break-all leading-relaxed">
          {line || ' '}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
