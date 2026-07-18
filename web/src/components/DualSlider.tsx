interface Props {
  min: number;
  max: number;
  step: number;
  lo: number;
  hi: number;
  onChange(lo: number, hi: number): void;
}

/** Two-thumb price range slider (no external deps). */
export default function DualSlider({ min, max, step, lo, hi, onChange }: Props) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className="dual-slider relative h-5 w-44 select-none">
      <div className="absolute top-1/2 -translate-y-1/2 h-1 w-full rounded bg-ink-700" />
      <div
        className="absolute top-1/2 -translate-y-1/2 h-1 rounded bg-sky-400"
        style={{ left: `${pct(lo)}%`, width: `${Math.max(0, pct(hi) - pct(lo))}%` }}
      />
      <input
        type="range" min={min} max={max} step={step} value={lo}
        onChange={(e) => onChange(Math.min(Number(e.target.value), hi - step), hi)}
        style={{ zIndex: lo > max - step * 4 ? 30 : 20 }}
      />
      <input
        type="range" min={min} max={max} step={step} value={hi}
        onChange={(e) => onChange(lo, Math.max(Number(e.target.value), lo + step))}
        style={{ zIndex: 25 }}
      />
    </div>
  );
}
