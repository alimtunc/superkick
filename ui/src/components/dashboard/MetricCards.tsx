interface MetricCardProps {
  label: string;
  value: number | string;
  sub: string;
  color: string;
  glow?: boolean;
}

interface KpiCellProps {
  label: string;
  value: number | string;
  alert?: boolean;
}

const valueColors: Record<string, string> = {
  mineral: "text-mineral",
  oxide: "text-oxide",
  cyan: "text-cyan",
  gold: "text-gold",
  dim: "text-silver",
};

export function MetricCard({ label, value, sub, color, glow }: MetricCardProps) {
  const valueColor = valueColors[color] ?? "text-fog";

  return (
    <div className={`panel p-5 ${glow ? "glow-red" : ""}`}>
      <p className="font-data text-[10px] uppercase tracking-wider text-dim mb-3">{label}</p>
      <p className={`font-data text-3xl font-medium tracking-tight leading-none ${valueColor}`}>
        {value}
      </p>
      <p className="font-data text-[10px] text-dim mt-3 truncate">{sub}</p>
    </div>
  );
}

export function KpiCell({ label, value, alert }: KpiCellProps) {
  return (
    <div
      className={`rounded border px-3 py-2.5 ${
        alert ? "border-oxide/30 bg-oxide-dim" : "border-edge bg-graphite/50"
      }`}
    >
      <p className="font-data text-[9px] uppercase tracking-wider text-dim leading-tight">
        {label}
      </p>
      <p className={`font-data text-base font-medium mt-1 ${alert ? "text-oxide" : "text-fog"}`}>
        {value}
      </p>
    </div>
  );
}
