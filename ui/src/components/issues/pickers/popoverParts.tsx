import type { CSSProperties, ReactNode } from 'react'

import { Icon } from '@/ui'

const POPLINE_STYLE: CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: 'var(--space-4)',
	padding: 'var(--space-3) var(--space-4)',
	borderRadius: 'var(--radius-sm)'
}

const POPLINE_SELECTED_STYLE: CSSProperties = {
	...POPLINE_STYLE,
	background: 'var(--bg-active)'
}

interface PopHeaderProps {
	value: string
	onChange: (next: string) => void
	placeholder: string
	ariaLabel: string
}

export function PopHeader({ value, onChange, placeholder, ariaLabel }: PopHeaderProps) {
	return (
		<div
			className="flex shrink-0 items-center border-b border-border"
			style={{ gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-5)' }}
		>
			<Icon name="search" size={14} className="text-fg-dim" />
			<input
				type="text"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				autoFocus
				aria-label={ariaLabel}
				className="w-full border-none bg-transparent text-fg outline-none placeholder:text-fg-dim"
				style={{ fontSize: 'var(--text-12)' }}
			/>
		</div>
	)
}

interface PoplineProps {
	selected?: boolean
	dim?: boolean
	onClick: () => void
	ariaLabel?: string
	children: ReactNode
}

export function Popline({ selected = false, dim = false, onClick, ariaLabel, children }: PoplineProps) {
	return (
		<button
			type="button"
			role="option"
			aria-selected={selected}
			aria-label={ariaLabel}
			onClick={onClick}
			className="popline w-full text-left text-fg transition-[background,color,transform] duration-100 ease-out outline-none hover:translate-x-0.5 focus-visible:bg-(--bg-active)"
			style={{
				...(selected ? POPLINE_SELECTED_STYLE : POPLINE_STYLE),
				...(dim ? { color: 'var(--fg-dim)' } : null),
				fontSize: 'var(--text-12)'
			}}
		>
			{children}
			{selected ? (
				<span style={{ marginLeft: 'auto', color: 'var(--accent)', display: 'inline-flex' }}>
					<Icon name="check" size={14} />
				</span>
			) : null}
		</button>
	)
}

export function PopBody({
	children,
	ariaLabel,
	multi
}: {
	children: ReactNode
	ariaLabel: string
	multi?: boolean
}) {
	return (
		<div
			className="flex min-h-0 flex-1 flex-col overflow-y-auto"
			style={{ padding: 'var(--space-3)' }}
			role="listbox"
			aria-label={ariaLabel}
			aria-multiselectable={multi}
		>
			{children}
		</div>
	)
}

export function PopFooter({ children }: { children: ReactNode }) {
	return (
		<div
			className="flex shrink-0 items-center border-t border-border text-fg-dim"
			style={{ padding: 'var(--space-3) var(--space-5)', fontSize: 'var(--text-12)' }}
		>
			{children}
		</div>
	)
}
