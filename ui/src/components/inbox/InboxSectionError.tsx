import { Button } from '@/components/ui/button'

interface InboxSectionErrorProps {
	message: string
	onRetry?: () => void
}

export function InboxSectionError({ message, onRetry }: InboxSectionErrorProps) {
	return (
		<div className="flex items-center justify-between gap-3 rounded border border-oxide/40 bg-oxide/5 px-3 py-2">
			<p className="font-data text-[10px] tracking-wide text-oxide">{message}</p>
			{onRetry ? (
				<Button
					variant="outline"
					size="xs"
					onClick={onRetry}
					className="font-data text-[10px] tracking-wider text-silver uppercase hover:text-fog"
				>
					Retry
				</Button>
			) : null}
		</div>
	)
}
