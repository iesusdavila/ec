export function BalanceMazeThumbnail({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <rect x="4" y="4" width="56" height="56" rx="10" fill="var(--color-surface-strong)" />
      <rect x="26" y="4" width="8" height="30" fill="var(--color-background)" />
      <circle cx="16" cy="16" r="7" fill="var(--color-accent)" />
      <circle cx="48" cy="48" r="7" fill="#3ECF8E" />
    </svg>
  );
}
