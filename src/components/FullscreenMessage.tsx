import type { ReactNode } from "react";
import { Screen } from "@/components/Screen";

/**
 * Mensaje simple de estado/errores orientado al usuario final.
 * Nunca debe usarse para volcar detalles técnicos (stack traces, códigos):
 * esos van a la consola, esto es lo único que ve la persona jugando.
 */
export function FullscreenMessage({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <Screen>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description ? <p className="text-muted max-w-sm">{description}</p> : null}
      {actions}
    </Screen>
  );
}
