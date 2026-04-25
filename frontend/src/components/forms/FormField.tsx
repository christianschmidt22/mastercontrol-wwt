import type { ReactNode } from 'react';
import { clsx } from 'clsx';

interface FormFieldProps {
  id: string;
  label: string;
  helper?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Reusable form-field wrapper.
 * Renders label → input (children) → helper text → inline error.
 * All form fields must have a <label> per DESIGN.md § Forms.
 */
export function FormField({
  id,
  label,
  helper,
  error,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={clsx('flex flex-col', className)} style={{ gap: 6 }}>
      <label
        htmlFor={id}
        style={{
          fontFamily: 'var(--body)',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--ink-1)',
          letterSpacing: '0.01em',
        }}
      >
        {label}
      </label>

      {children}

      {helper && !error && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink-2)',
            fontFamily: 'var(--body)',
            lineHeight: 1.5,
          }}
        >
          {helper}
        </p>
      )}

      {error && (
        <p
          role="alert"
          style={{
            fontSize: 12,
            color: 'var(--accent)',
            fontFamily: 'var(--body)',
            lineHeight: 1.5,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
