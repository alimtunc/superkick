// ── Executive Summary Cards ─────────────────────────────────────────────

export function MetricCard({ label, value, sub, color, glow }: {
  label: string;
  value: number | string;
  sub: string;
  color: string;
  glow?: boolean;
}) {
  const valueColor =
    color === "mineral" ? "text-mineral" :
    color === "oxide" ? "text-oxide" :
    color === "cyan" ? "text-cyan" :
    color === "gold" ? "text-gold" :
    color === "dim" ? "text-silver" :
    "text-fog";
  const glowClass = glow ? "glow-red" : "";

  return (
    <div className={`panel p-5 ${glowClass}`}>
      <p className="font-data text-[10px] uppercase tracking-wider text-dim mb-3">{label}</p>
      <p className={`font-data text-3xl font-medium tracking-tight leading-none ${valueColor}`}>
        {value}
      </p>
      <p className="font-data text-[10px] text-dim mt-3 truncate">{sub}</p>
    </div>
  );
}

export function KpiCell({ label, value, alert }: { label: string; value: number | string; alert?: boolean }) {
  return (
    <div className={`rounded border px-3 py-2.5 ${
      alert ? "border-oxide/30 bg-oxide-dim" : "border-edge bg-graphite/50"
    }`}>
      <p className="font-data text-[9px] uppercase tracking-wider text-dim leading-tight">{label}</p>
      <p className={`font-data text-base font-medium mt-1 ${alert ? "text-oxide" : "text-fog"}`}>
        {value}
      </p>
    </div>
  );
}
