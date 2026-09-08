"use client";

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "xl";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/**
 * El aspecto (relleno, canto, sombra y estados) vive en `globals.css`, en
 * `@layer components`. Aquí solo se elige la variante y el tamaño.
 *
 * Está así porque el relieve de un botón son tres o cuatro sombras encadenadas
 * que además cambian en hover y en `:active`; escrito con utilidades sueltas de
 * Tailwind eran cadenas ilegibles que ya habían empezado a divergir entre la
 * pantalla del monitor y la del jugador. Con clases reales, cambiar el azul de
 * toda la app es tocar una variable.
 */
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

const SIZE_CLASSES: Record<Size, string> = {
  md: "px-5 py-2.5 text-base rounded-xl",
  lg: "px-8 py-4 text-xl rounded-2xl",
  /** Reservado para el Monitor en pantallas grandes; los jugadores usan "lg". */
  xl: "px-8 py-4 text-xl rounded-2xl lg:px-11 lg:py-5 lg:text-2xl lg:rounded-3xl",
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
      className={`btn ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  );
}
