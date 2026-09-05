/**
 * Ilustraciones simples en SVG para objetos de juego (sección 20 del README:
 * evitar imágenes pesadas, priorizar SVG/iconografía consistente y ligera).
 * Nada de emojis: son formas vectoriales propias, coloreadas de forma
 * reconocible para cada fruta/objeto.
 */

type IconProps = { className?: string };

export function AppleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path
        d="M32 24c-9 0-16 7.8-16 18.5C16 52 22.5 58 28 58c2.6 0 4-1.2 6-1.2s3.4 1.2 6 1.2c6 0 12-8 12-18.5C52 30.5 45 24 37 24c-1.8 0-3.4.4-5 1.1-1.6-.7-3.2-1.1-5-1.1z"
        fill="#e5484d"
      />
      <path d="M31 24c-.5-4 1.5-7.5 5-9-.5 4-2 7.5-5 9z" fill="#7a3b1e" />
      <ellipse cx="38" cy="15" rx="6" ry="3.2" fill="#3ecf8e" transform="rotate(-25 38 15)" />
    </svg>
  );
}

export function WatermelonIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path d="M4 30a28 28 0 0 1 56 0z" fill="#3ecf8e" />
      <path d="M9 30a23 23 0 0 1 46 0z" fill="#f4f4f5" />
      <path d="M14 30a18 18 0 0 1 36 0z" fill="#e5484d" />
      <circle cx="26" cy="24" r="1.6" fill="#111113" />
      <circle cx="32" cy="27" r="1.6" fill="#111113" />
      <circle cx="38" cy="24" r="1.6" fill="#111113" />
    </svg>
  );
}

export function OrangeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <circle cx="32" cy="34" r="20" fill="#FFA53C" />
      <path
        d="M32 34 L32 20 M32 34 L44 26 M32 34 L44 42 M32 34 L20 42 M32 34 L20 26"
        stroke="#e8862a"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.5"
      />
      <ellipse cx="30" cy="16" rx="4.5" ry="2.6" fill="#3ecf8e" transform="rotate(-15 30 16)" />
    </svg>
  );
}

export function BananaIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path
        d="M14 44c4 8 16 12 26 8 8-3.2 12-9 13.5-15-2 1-4 1.6-6 1.6-11 0-21-6-27-16-3 3-5 7-6.5 11.5C12.5 37.5 12.5 40.5 14 44z"
        fill="#FFC24B"
      />
      <path
        d="M14 44c4 8 16 12 26 8 8-3.2 12-9 13.5-15"
        fill="none"
        stroke="#e0a52f"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M20.5 22.5c1.2-2 2.6-3.6 4-5" stroke="#7a5a1e" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function BombIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <circle cx="30" cy="38" r="18" fill="#27272a" />
      <circle cx="24" cy="32" r="4" fill="#52525b" opacity="0.6" />
      <path
        d="M36 22c2-4 6-6 10-6"
        fill="none"
        stroke="#a1a1aa"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="47" cy="14" r="4" fill="#FF6B5B" />
    </svg>
  );
}

/** Marca de corte que destella brevemente sobre un objeto recién cortado. */
export function SliceFlash({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <line x1="6" y1="52" x2="58" y2="12" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
      <line x1="6" y1="52" x2="58" y2="12" stroke="#5B8CFF" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function DartIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <line x1="32" y1="6" x2="32" y2="46" stroke="#e4e4e7" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="6" r="4" fill="#111113" />
      <path d="M32 46 L22 60 L32 54 L42 60 Z" fill="#FF6B5B" />
    </svg>
  );
}

export function CarIcon({ className, color = "#5B8CFF" }: IconProps & { color?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect x="6" y="26" width="52" height="16" rx="6" fill={color} />
      <rect x="16" y="16" width="28" height="16" rx="6" fill={color} opacity="0.85" />
      <rect x="20" y="20" width="9" height="8" rx="1.5" fill="#0a0a0b" opacity="0.5" />
      <rect x="31" y="20" width="9" height="8" rx="1.5" fill="#0a0a0b" opacity="0.5" />
      <circle cx="18" cy="44" r="6" fill="#111113" />
      <circle cx="46" cy="44" r="6" fill="#111113" />
    </svg>
  );
}

export function HurdleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect x="8" y="10" width="6" height="44" rx="2" fill="#71717a" />
      <rect x="50" y="10" width="6" height="44" rx="2" fill="#71717a" />
      <rect x="6" y="26" width="52" height="7" rx="3" fill="#FF6B5B" />
    </svg>
  );
}
