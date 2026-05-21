import type { Ref } from 'react'

import { Pill } from '@/components/ui/pill'
import type { SearchScope } from '@/types'
import { Icon } from '@/ui/Icon'
import { Kbd } from '@/ui/Kbd'

interface CommandBarHeaderProps {
	value: string
	scope: SearchScope
	scopePinned: boolean
	onChange: (next: string) => void
	onKeyDown: (e: React.KeyboardEvent) => void
	onClearScope: () => void
	inputRef?: Ref<HTMLInputElement>
}

const SCOPE_LABEL: Record<SearchScope, string> = {
	all: 'All',
	issues: 'Issues only',
	comments: 'Comments only',
	files: 'Files only',
	runs: 'Runs only',
	actions: 'Actions only'
}

export function CommandBarHeader({
	value,
	scope,
	scopePinned,
	onChange,
	onKeyDown,
	onClearScope,
	inputRef
}: CommandBarHeaderProps) {
	return (
		<div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
			<Icon name="search" size={15} className="text-fg-dim" aria-hidden="true" />
			{scopePinned ? (
				<Pill tone="accent" size="xs">
					<button
						type="button"
						onClick={onClearScope}
						className="-mx-1 flex items-center gap-1 px-1"
					>
						{SCOPE_LABEL[scope]}
						<Icon name="x" size={10} />
					</button>
				</Pill>
			) : null}
			<input
				ref={inputRef}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={onKeyDown}
				placeholder="Search issues, files, runs…"
				aria-label="Search"
				className="flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-dim"
			/>
			<Kbd>Esc</Kbd>
		</div>
	)
}
