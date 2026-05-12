export function IssueDescription({ description }: { description: string }) {
	if (!description.trim()) return null

	return (
		<pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-fg-muted">
			{description}
		</pre>
	)
}
