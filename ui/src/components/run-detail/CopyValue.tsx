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
		navigator.clipboard.writeText(value)
		toast('Copied to clipboard')
	}

	return (
		<button
			type="button"
			onClick={handleCopy}
			title={value}
			className={`inline-flex items-center transition-colors hover:text-fog ${!hideIcon ? 'gap-1' : ''} ${className}`}
		>
			<span className="truncate">{display ?? value}</span>
			{!hideIcon ? <Copy size={10} className="shrink-0 text-dim" /> : null}
		</button>
	)
}
