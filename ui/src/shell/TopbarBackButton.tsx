import { useBackNavigation } from '@/hooks/useBackNavigation'
import { ArrowLeft } from 'lucide-react'

interface TopbarBackButtonProps {
	fallbackTo?: string
}

export function TopbarBackButton({ fallbackTo = '/' }: TopbarBackButtonProps) {
	const { goBack, hasHistory } = useBackNavigation(fallbackTo)
	const label = hasHistory ? 'Go back' : 'Back to control center'

	return (
		<button
			type="button"
			onClick={goBack}
			aria-label={label}
			title={label}
			className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
		>
			<ArrowLeft size={15} strokeWidth={1.75} aria-hidden="true" />
		</button>
	)
}
