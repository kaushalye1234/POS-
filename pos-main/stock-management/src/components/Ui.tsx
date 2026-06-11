import type { ButtonHTMLAttributes, InputHTMLAttributes, PropsWithChildren, ReactNode, SelectHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
}

export function Button({ children, className = '', loading = false, variant = 'secondary', ...props }: ButtonProps): JSX.Element {
  return (
    <button className={`btn ${variant} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading ? <Loader2 aria-hidden="true" className="spin" size={16} /> : null}
      {children}
    </button>
  );
}

interface FieldProps extends PropsWithChildren {
  label: string;
  hint?: string;
}

export function Field({ children, hint, label }: FieldProps): JSX.Element {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export function TextInput({ label, hint, ...props }: TextInputProps): JSX.Element {
  return (
    <Field hint={hint} label={label}>
      <input {...props} />
    </Field>
  );
}

interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: ReactNode;
  hint?: string;
}

export function SelectInput({ children, hint, label, ...props }: SelectInputProps): JSX.Element {
  return (
    <Field hint={hint} label={label}>
      <select {...props}>{children}</select>
    </Field>
  );
}

interface MetricProps {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn' | 'danger';
  detail?: string;
}

export function Metric({ detail, label, tone = 'neutral', value }: MetricProps): JSX.Element {
  return (
    <article className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

interface EmptyStateProps {
  title: string;
  body?: string;
}

export function EmptyState({ body, title }: EmptyStateProps): JSX.Element {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {body ? <span>{body}</span> : null}
    </div>
  );
}

interface ModalProps extends PropsWithChildren {
  title: string;
  onClose: () => void;
  wide?: boolean;
}

export function Modal({ children, onClose, title, wide = false }: ModalProps): JSX.Element {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-modal="true"
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <Button aria-label="Close modal" onClick={onClose} type="button" variant="ghost">
            Close
          </Button>
        </div>
        {children}
      </section>
    </div>
  );
}
