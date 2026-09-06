"use client";

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "xl";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground hover:opacity-90",
  secondary: "bg-surface-strong text-foreground hover:bg-border",
  ghost: "bg-transparent text-foreground border border-border hover:bg-surface",
  danger: "bg-transparent text-red-500 border border-red-500/40 hover:bg-red-500/10",
};

const SIZE_CLASSES: Record<Size, string> = {
  md: "px-5 py-3 text-base rounded-xl",
  lg: "px-8 py-5 text-xl rounded-2xl",
  /** Reservado para el Monitor en pantallas grandes; los jugadores usan "lg". */
  xl: "px-8 py-5 text-xl rounded-2xl lg:px-12 lg:py-7 lg:text-3xl lg:rounded-3xl",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none select-none ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  );
}
