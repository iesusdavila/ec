import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Permite que los teléfonos conectados a la misma red local (Wi-Fi de
   * casa) alcancen el servidor de desarrollo por IP, tal como pide el flujo
   * de prueba local del README (monitor en la compu, jugador en el
   * teléfono). Next.js bloquea esto por defecto en `next dev` por
   * seguridad; solo aplica en desarrollo, nunca en producción.
   */
  allowedDevOrigins: ["192.168.100.175", "192.168.*.*", "10.*.*.*"],
};

export default nextConfig;
