interface InboxEmptyStateProps {
	message: string
}

export function InboxEmptyState({ message }: InboxEmptyStateProps) {
	return (
		<div className="rounded border border-dashed border-edge px-4 py-3">
			<p className="font-data text-[10px] tracking-wide text-dim">{message}</p>
		</div>
	)
}
