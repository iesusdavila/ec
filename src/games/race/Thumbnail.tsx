export function RaceThumbnail({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <rect x="4" y="10" width="56" height="10" rx="4" fill="var(--color-surface-strong)" />
      <rect x="4" y="27" width="56" height="10" rx="4" fill="var(--color-surface-strong)" />
      <rect x="4" y="44" width="56" height="10" rx="4" fill="var(--color-surface-strong)" />
      <circle cx="14" cy="15" r="5" fill="var(--color-accent)" />
      <circle cx="24" cy="32" r="5" fill="#FF6B5B" />
      <circle cx="10" cy="49" r="5" fill="#3ECF8E" />
    </svg>
  );
}
