export function BombArenaThumbnail({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <rect x="4" y="4" width="56" height="56" rx="6" fill="#1b1f27" />
      {[16, 32, 48].map((x) =>
        [16, 32, 48].map((y) => (
          <rect key={`${x}-${y}`} x={x - 5} y={y - 5} width="10" height="10" rx="2" fill="#4a4f5c" />
        ))
      )}
      <rect x="19" y="35" width="10" height="10" rx="2" fill="#8a6440" />
      <circle cx="24" cy="20" r="5" fill="var(--color-accent)" />
      <circle cx="44" cy="44" r="5" fill="#FF6B5B" />
      <circle cx="40" cy="20" r="4.5" fill="#17171b" stroke="#FFB27A" strokeWidth="1" />
      <path d="M40 15 q3 -4 5 -1" stroke="#FF9A2E" strokeWidth="1.5" />
    </svg>
  );
}
