export function FruitSliceThumbnail({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <circle cx="24" cy="26" r="16" fill="var(--color-accent)" />
      <circle cx="46" cy="44" r="10" fill="var(--color-surface-strong)" />
      <line x1="8" y1="48" x2="52" y2="12" stroke="var(--color-foreground)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
