import { notFound } from "next/navigation";
import { PositionDebugClient } from "@/app/dev/posicion/PositionDebugClient";

/**
 * Pantalla interna de depuración del rastreo de POSICIÓN.
 * No forma parte de la experiencia final: solo existe para desarrollo.
 */
export default function PositionDebugPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <PositionDebugClient />;
}
