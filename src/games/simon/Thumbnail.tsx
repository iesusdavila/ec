export function SimonThumbnail({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <rect x="4" y="4" width="26" height="26" rx="6" fill="var(--color-accent)" />
      <rect x="34" y="4" width="26" height="26" rx="6" fill="var(--color-surface-strong)" />
      <rect x="4" y="34" width="26" height="26" rx="6" fill="var(--color-surface-strong)" />
      <rect x="34" y="34" width="26" height="26" rx="6" fill="var(--color-surface-strong)" />
    </svg>
  );
}
