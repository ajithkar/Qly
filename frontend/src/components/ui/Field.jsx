import { forwardRef } from 'react';
import PropTypes from 'prop-types';
import { cn } from '@/lib/cn';

const base =
  'w-full rounded-card border border-line bg-surface px-3 py-2 text-sm ' +
  'placeholder:text-muted/70 disabled:opacity-50 transition-colors ' +
  'focus:border-signal';

export const Input = forwardRef(function Input({ className, invalid, ...rest }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(base, invalid && 'border-rose', className)}
      {...rest}
    />
  );
});
Input.propTypes = { className: PropTypes.string, invalid: PropTypes.bool };

export const Select = forwardRef(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(base, 'pr-8', className)} {...rest}>
      {children}
    </select>
  );
});
Select.propTypes = { className: PropTypes.string, children: PropTypes.node };

export const Textarea = forwardRef(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} rows={3} className={cn(base, className)} {...rest} />;
});
Textarea.propTypes = { className: PropTypes.string };

export const FileInput = forwardRef(function FileInput({ className, invalid, ...rest }, ref) {
  return (
    <input
      ref={ref}
      type="file"
      aria-invalid={invalid || undefined}
      className={cn(
        'block w-full text-sm text-muted file:mr-3 file:rounded-card file:border-0 ' +
          'file:bg-signal/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-signal ' +
          'hover:file:bg-signal/20',
        invalid && 'text-rose',
        className,
      )}
      {...rest}
    />
  );
});
FileInput.propTypes = { className: PropTypes.string, invalid: PropTypes.bool };

/** Label + control + error, wired for screen readers. */
export function Field({ label, htmlFor, error, hint, required, children }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-rose">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-rose">
          {error}
        </p>
      )}
    </div>
  );
}

Field.propTypes = {
  label: PropTypes.node.isRequired,
  htmlFor: PropTypes.string,
  error: PropTypes.string,
  hint: PropTypes.node,
  required: PropTypes.bool,
  children: PropTypes.node,
};
