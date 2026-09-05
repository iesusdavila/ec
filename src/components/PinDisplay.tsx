export function PinDisplay({ pin }: { pin: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-sm uppercase tracking-[0.3em] text-muted">PIN</span>
      <div className="flex gap-3">
        {pin.split("").map((digit, i) => (
          <span
            key={i}
            className="flex h-20 w-16 items-center justify-center rounded-2xl bg-surface text-5xl font-semibold tabular-nums border border-border"
          >
            {digit}
          </span>
        ))}
      </div>
    </div>
  );
}
