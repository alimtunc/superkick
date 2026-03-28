import type { DistItem } from "./utils";

export function DistPanel({ title, items, total }: { title: string; items: DistItem[]; total: number }) {
  return (
    <div className="panel p-4">
      <h4 className="font-data text-[10px] uppercase tracking-wider text-dim mb-4">{title}</h4>
      {total === 0 ? (
        <p className="font-data text-[11px] text-dim">No data</p>
      ) : (
        <>
          <div className="flex h-1.5 rounded-full overflow-hidden bg-edge mb-4">
            {items.filter((i) => i.count > 0).map((item) => (
              <div key={item.label} className={`${item.color} transition-all`}
                style={{ width: `${(item.count / total) * 100}%` }} />
            ))}
          </div>
          <div className="space-y-1.5">
            {items.filter((i) => i.count > 0).map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-sm ${item.color}`} />
                  <span className="text-[11px] text-silver capitalize">{item.label}</span>
                </div>
                <span className="font-data text-[11px] text-ash">
                  {item.count}
                  <span className="text-dim ml-1">({Math.round((item.count / total) * 100)}%)</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function DurationRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-silver">{label}</span>
      <span className={`font-data text-sm font-medium ${color}`}>{value}</span>
    </div>
  );
}
