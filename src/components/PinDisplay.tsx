export function PinDisplay({ pin }: { pin: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="text-sm uppercase tracking-[0.3em] text-muted lg:text-lg">PIN</span>
      <div className="flex gap-3 lg:gap-4">
        {pin.split("").map((digit, i) => (
          <span
            key={i}
            className="flex h-20 w-16 items-center justify-center rounded-2xl bg-surface text-5xl font-semibold tabular-nums border border-border lg:h-32 lg:w-24 lg:text-8xl"
          >
            {digit}
          </span>
        ))}
      </div>
    </div>
  );
}
