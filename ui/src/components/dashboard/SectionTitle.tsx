export function SectionTitle({ title, accent, count }: { title: string; accent?: string; count?: number }) {
  const accentColor = accent === "oxide" ? "text-oxide" : accent === "mineral" ? "text-mineral" : "text-silver";
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className={`font-data text-[11px] font-medium uppercase tracking-widest ${accentColor}`}>
        {title}
      </h2>
      {count !== undefined && (
        <span className="font-data text-[11px] text-dim">{count}</span>
      )}
      <div className="flex-1 h-px bg-edge" />
    </div>
  );
}
