import { Component, type ErrorInfo, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
	children: ReactNode
	fallback?: ReactNode
}

interface ErrorBoundaryState {
	error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = { error: null }

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error }
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error('[ErrorBoundary]', error, info.componentStack)
	}

	render() {
		if (this.state.error) {
			return (
				this.props.fallback ?? (
					<div className="flex min-h-screen items-center justify-center bg-void">
						<div className="panel glow-red max-w-md p-6 text-center">
							<p className="font-data mb-3 text-[11px] tracking-wider text-oxide uppercase">
								Something went wrong
							</p>
							<p className="mb-4 text-sm text-silver">{this.state.error.message}</p>
							<Button
								variant="outline"
								size="sm"
								onClick={() => this.setState({ error: null })}
								className="font-data text-[11px] text-silver hover:text-fog"
							>
								TRY AGAIN
							</Button>
						</div>
					</div>
				)
			)
		}

		return this.props.children
	}
}
