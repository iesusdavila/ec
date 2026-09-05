import { notFound } from "next/navigation";
import { SensorDebugClient } from "@/app/dev/sensores/SensorDebugClient";

/**
 * Pantalla interna de depuración de sensores (Fase 2).
 * No forma parte de la experiencia final: solo existe para desarrollo.
 */
export default function SensorDebugPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <SensorDebugClient />;
}
