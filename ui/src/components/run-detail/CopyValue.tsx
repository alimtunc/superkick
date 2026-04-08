import type { ReactNode } from 'react'

import { Copy } from 'lucide-react'
import { toast } from 'sonner'

export function CopyValue({
	value,
	display,
	hideIcon = false,
	className = ''
}: {
	value: string
	display?: ReactNode
	hideIcon?: boolean
	className?: string
}) {
	const handleCopy = () => {
		navigator.clipboard.writeText(value).then(
			() => toast('Copied to clipboard'),
			() => toast.error('Failed to copy')
		)
	}

	return (
		<button
			type="button"
			onClick={handleCopy}
			title={value}
			className={`inline-flex items-center transition-colors hover:text-fog ${!hideIcon ? 'gap-1' : ''} ${className}`}
		>
			<span className="inline-flex min-w-0 items-center gap-1.5">{display ?? value}</span>
			{!hideIcon ? <Copy size={10} className="shrink-0 text-dim" /> : null}
		</button>
	)
}
