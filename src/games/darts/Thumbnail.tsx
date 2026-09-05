export function DartsThumbnail({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <circle cx="32" cy="32" r="26" fill="var(--color-surface-strong)" />
      <circle cx="32" cy="32" r="17" fill="var(--color-background)" />
      <circle cx="32" cy="32" r="8" fill="var(--color-accent)" />
    </svg>
  );
}
