import { Component, type ErrorInfo, type ReactNode } from 'react'

interface DiffErrorBoundaryProps {
	children: ReactNode
	patch: string
}

interface DiffErrorBoundaryState {
	error: Error | null
}

export class DiffErrorBoundary extends Component<DiffErrorBoundaryProps, DiffErrorBoundaryState> {
	state: DiffErrorBoundaryState = { error: null }

	static getDerivedStateFromError(error: Error): DiffErrorBoundaryState {
		return { error }
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error('[DiffErrorBoundary]', error, info.componentStack)
	}

	render() {
		if (this.state.error) {
			return (
				<div>
					<p className="mb-1 flex items-center gap-2 text-[11px] text-fg-muted">
						Syntax highlighting unavailable.
						<button
							type="button"
							onClick={() => window.location.reload()}
							className="rounded-[3px] text-accent underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
						>
							Reload
						</button>
					</p>
					<pre className="terminal overflow-x-auto whitespace-pre">{this.props.patch}</pre>
				</div>
			)
		}

		return this.props.children
	}
}
