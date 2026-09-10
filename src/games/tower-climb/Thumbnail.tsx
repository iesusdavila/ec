export function TowerClimbThumbnail({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <rect x="6" y="50" width="52" height="6" rx="3" fill="var(--color-surface-strong)" />
      <rect x="10" y="36" width="24" height="5" rx="2.5" fill="var(--color-surface-strong)" />
      <rect x="34" y="24" width="22" height="5" rx="2.5" fill="#2E7D52" />
      <rect x="8" y="12" width="22" height="5" rx="2.5" fill="#4E7C93" />
      <circle cx="20" cy="31" r="5" fill="var(--color-accent)" />
      <circle cx="44" cy="19" r="5" fill="#FF6B5B" />
      <path d="M32 60 L32 6 M32 6 l-4 5 M32 6 l4 5" stroke="var(--color-muted)" strokeWidth="1.5" opacity="0.35" />
    </svg>
  );
}
