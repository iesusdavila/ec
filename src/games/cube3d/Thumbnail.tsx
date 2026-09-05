export function Cube3dThumbnail({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <polygon points="32,6 58,20 58,44 32,58 6,44 6,20" fill="var(--color-surface-strong)" />
      <polygon points="32,6 58,20 32,34 6,20" fill="var(--color-accent)" />
    </svg>
  );
}
