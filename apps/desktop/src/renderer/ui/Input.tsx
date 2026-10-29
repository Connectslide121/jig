import { Search, X } from "lucide-react";
import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";

const field =
  "no-drag w-full rounded-md border border-line-strong bg-raised px-2 text-sm text-fg placeholder:text-hint " +
  "outline-none focus:border-focus disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(field, "h-7", className)} spellCheck={false} {...rest} />;
});

/**
 * A filter or search box: the magnifier beside the text (never over it) and, with `onClear` and a
 * value, an × that empties it. Use it for every "Filter …" field.
 */
export const SearchInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { onClear?: () => void; boxClassName?: string }
>(function SearchInput({ className, boxClassName, onClear, ...rest }, ref) {
  return (
    <div
      className={cn(
        "no-drag flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md border border-line-strong bg-raised px-2",
        "focus-within:border-focus",
        boxClassName,
      )}
    >
      <Search className="size-3.5 shrink-0 text-hint" aria-hidden />
      <input
        ref={ref}
        type="text"
        spellCheck={false}
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-hint disabled:opacity-50",
          className,
        )}
        {...rest}
      />
      {onClear && rest.value ? (
        <button
          type="button"
          aria-label="Clear"
          title="Clear"
          className="shrink-0 rounded-sm text-hint hover:text-fg"
          onClick={onClear}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(field, "py-1.5 leading-normal", className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn(field, "h-7 pr-6", className)} {...rest}>
      {children}
    </select>
  );
});

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "no-drag relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-accent" : "bg-active",
      )}
    >
      <span
        className={cn(
          "inline-block size-3 rounded-full shadow-card transition-transform",
          checked ? "translate-x-3.5 bg-on-accent" : "translate-x-0.5 bg-muted",
        )}
      />
    </button>
  );
}
