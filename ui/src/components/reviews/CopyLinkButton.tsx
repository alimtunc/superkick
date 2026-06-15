import { useCallback, useEffect, useRef, useState } from 'react'

import { Icon } from '@/ui'

import { REVIEW_CHIP_CLASS } from './reviewChrome'

interface CopyLinkButtonProps {
	url: string
}

export function CopyLinkButton({ url }: CopyLinkButtonProps) {
	const [copied, setCopied] = useState(false)
	const timer = useRef<number | null>(null)

	const copy = useCallback(() => {
		void navigator.clipboard?.writeText(url)
		setCopied(true)
		if (timer.current) window.clearTimeout(timer.current)
		timer.current = window.setTimeout(() => setCopied(false), 1200)
	}, [url])

	useEffect(
		() => () => {
			if (timer.current) window.clearTimeout(timer.current)
		},
		[]
	)

	return (
		<button
			type="button"
			onClick={copy}
			aria-label="Copy pull request link"
			className={REVIEW_CHIP_CLASS}
		>
			<Icon name={copied ? 'check' : 'link'} size={12} className="ic" />
			{copied ? 'Copied' : 'Copy link'}
		</button>
	)
}
