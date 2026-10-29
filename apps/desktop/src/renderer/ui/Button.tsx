import type { LucideIcon } from "lucide-react";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "./cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  busy?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "bg-raised text-fg border border-line-strong hover:bg-hover",
  ghost: "text-fg hover:bg-hover",
  danger: "bg-danger text-on-danger hover:opacity-90",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-6 px-2 text-sm gap-1",
  md: "h-7 px-3 text-sm gap-1.5",
};

/** The one button. Use `variant` for emphasis; `icon` for a leading icon; `busy` shows a spinner. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    icon: Icon,
    busy,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || busy}
      className={cn(
        "no-drag inline-flex shrink-0 items-center justify-center rounded-md font-medium leading-none whitespace-nowrap transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {busy ? <Spinner size="sm" /> : Icon ? <Icon className="block size-4 shrink-0" /> : null}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Accessible label, also shown as the tooltip. */
  label: string;
  size?: ButtonSize;
  active?: boolean;
}

/** A square, icon-only button with a tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, size = "md", active, className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "no-drag inline-flex shrink-0 items-center justify-center rounded-md text-muted transition-colors",
        "hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-50",
        active && "bg-active text-fg",
        size === "sm" ? "size-7" : "size-8",
        className,
      )}
      {...rest}
    >
      <Icon className={size === "sm" ? "size-4" : "size-4.5"} />
    </button>
  );
});
