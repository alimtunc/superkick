import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'
import { RefreshCw, TriangleAlert } from 'lucide-react'

interface ChunkLoadErrorPanelProps {
	message?: string
}

export function ChunkLoadErrorPanel({ message }: ChunkLoadErrorPanelProps) {
	return (
		<div className="flex h-full min-h-0 flex-1 items-center justify-center px-6 py-12">
			<div
				role="alert"
				className="flex w-full max-w-sm flex-col items-center gap-4 rounded-md border border-border bg-surface px-6 py-8 text-center"
			>
				<TriangleAlert size={20} strokeWidth={1.75} className="text-danger" aria-hidden="true" />
				<div className="flex flex-col gap-1">
					<p className="text-sm font-medium text-fg">This view needs a reload</p>
					<p className="text-xs text-fg-muted">
						{message ??
							'A newer version of the app is available, so part of this page could not load. Reload to continue.'}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button size="sm" onClick={() => window.location.reload()}>
						<RefreshCw aria-hidden="true" />
						Reload
					</Button>
					<Button variant="outline" size="sm" render={<Link to="/issues" />}>
						Back to issues
					</Button>
				</div>
			</div>
		</div>
	)
}
