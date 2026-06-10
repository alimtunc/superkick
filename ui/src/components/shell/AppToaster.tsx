import { Toaster } from 'sonner'

export function AppToaster() {
	return (
		<Toaster
			position="top-right"
			duration={1500}
			toastOptions={{
				style: {
					background: 'var(--color-surface)',
					border: '1px solid var(--color-border)',
					color: 'var(--color-fg)',
					fontSize: '12px'
				}
			}}
		/>
	)
}
