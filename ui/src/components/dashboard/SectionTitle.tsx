interface SectionTitleProps {
  title: string;
  accent?: string;
  count?: number;
}

const accentColors: Record<string, string> = {
  oxide: "text-oxide",
  mineral: "text-mineral",
  gold: "text-gold",
};

export function SectionTitle({ title, accent, count }: SectionTitleProps) {
  const accentColor = (accent && accentColors[accent]) ?? "text-silver";
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className={`font-data text-[11px] font-medium uppercase tracking-widest ${accentColor}`}>
        {title}
      </h2>
      {count !== undefined ? <span className="font-data text-[11px] text-dim">{count}</span> : null}
      <div className="flex-1 h-px bg-edge" />
    </div>
  );
}
