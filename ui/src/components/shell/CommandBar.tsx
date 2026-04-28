import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { runsQuery } from '@/lib/queries'
import { useCommandBarStore } from '@/stores/commandBar'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Bot, Inbox, ListTodo, Play, Search, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface CommandItem {
	id: string
	label: string
	hint?: string
	icon: LucideIcon
	run: () => void
}

export function CommandBar() {
	const { open, closeBar, toggle } = useCommandBarStore()
	const router = useRouter()
	const { data: runs = [] } = useQuery({ ...runsQuery(), enabled: open })
	const inputRef = useRef<HTMLInputElement>(null)
	const [query, setQuery] = useState('')
	const [activeIdx, setActiveIdx] = useState(0)

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			const isK = e.key.toLowerCase() === 'k'
			if (isK && (e.metaKey || e.ctrlKey)) {
				e.preventDefault()
				toggle()
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [toggle])

	useEffect(() => {
		if (open) {
			setQuery('')
			setActiveIdx(0)
			requestAnimationFrame(() => inputRef.current?.focus())
		}
	}, [open])

	const navItems: CommandItem[] = [
		{
			id: 'nav:inbox',
			label: 'Go to Inbox',
			hint: 'Triage',
			icon: Inbox,
			run: () => router.navigate({ to: '/' })
		},
		{
			id: 'nav:issues',
			label: 'Go to Issues',
			hint: 'Backlog',
			icon: ListTodo,
			run: () => router.navigate({ to: '/issues' })
		},
		{
			id: 'nav:runs',
			label: 'Go to Runs',
			hint: 'All runs',
			icon: Play,
			run: () => router.navigate({ to: '/runs' })
		},
		{
			id: 'nav:agents',
			label: 'Go to Agents',
			hint: 'Roles',
			icon: Bot,
			run: () => router.navigate({ to: '/agents' })
		},
		{
			id: 'nav:settings',
			label: 'Go to Settings',
			icon: Settings,
			run: () => router.navigate({ to: '/settings' })
		}
	]

	const runItems: CommandItem[] = open
		? runs.slice(0, 20).map((r) => ({
				id: `run:${r.id}`,
				label: `Open run · ${r.issue_identifier ?? r.id.slice(0, 8)}`,
				hint: r.state.replace(/_/g, ' '),
				icon: Play,
				run: () => router.navigate({ to: '/runs/$runId', params: { runId: r.id } })
			}))
		: []

	const items = [...navItems, ...runItems]

	const q = query.trim().toLowerCase()
	const filtered = q
		? items.filter(
				(it) =>
					it.label.toLowerCase().includes(q) ||
					(it.hint ? it.hint.toLowerCase().includes(q) : false)
			)
		: items

	useEffect(() => {
		if (activeIdx >= filtered.length) setActiveIdx(0)
	}, [filtered, activeIdx])

	if (!open) return null

	function run(item: CommandItem) {
		item.run()
		closeBar()
	}

	function onKeyDown(e: React.KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault()
			closeBar()
			return
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault()
			setActiveIdx((i) => Math.min(filtered.length - 1, i + 1))
			return
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault()
			setActiveIdx((i) => Math.max(0, i - 1))
			return
		}
		if (e.key === 'Enter') {
			e.preventDefault()
			const it = filtered[activeIdx]
			if (it) run(it)
		}
	}

	return createPortal(
		<div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]">
			<div
				role="presentation"
				className="absolute inset-0 bg-black/60 backdrop-blur-sm"
				onClick={closeBar}
			/>
			<div className="relative z-10 w-full max-w-xl overflow-hidden rounded-md border border-edge bg-panel shadow-2xl">
				<div className="flex items-center gap-2 border-b border-edge px-3 py-2.5">
					<Search size={14} strokeWidth={1.75} className="text-ash" aria-hidden="true" />
					<input
						ref={inputRef}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={onKeyDown}
						placeholder="Navigate, open a run…"
						className="font-data flex-1 bg-transparent text-[12px] text-fog placeholder:text-ash focus:outline-none"
					/>
					<kbd className="font-data rounded border border-edge px-1.5 py-0.5 text-[9px] tracking-wider text-ash uppercase">
						Esc
					</kbd>
				</div>
				<ul className="max-h-80 overflow-y-auto py-1">
					{filtered.length === 0 ? (
						<li className="font-data px-3 py-4 text-center text-[11px] text-ash">No matches</li>
					) : (
						filtered.map((item, i) => {
							const Icon = item.icon
							const active = i === activeIdx
							return (
								<li key={item.id}>
									<button
										type="button"
										onMouseEnter={() => setActiveIdx(i)}
										onClick={() => run(item)}
										className={[
											'flex h-8 w-full items-center gap-2.5 px-3 text-left transition-colors focus-visible:outline-none',
											active
												? 'bg-slate-deep text-fog'
												: 'text-silver hover:bg-slate-deep/40'
										].join(' ')}
									>
										<Icon
											size={14}
											strokeWidth={1.75}
											aria-hidden="true"
											className={active ? 'text-mineral' : 'text-ash'}
										/>
										<span className="font-data flex-1 text-[12px]">{item.label}</span>
										{item.hint ? (
											<span className="font-data text-[10px] tracking-wider text-ash uppercase">
												{item.hint}
											</span>
										) : null}
									</button>
								</li>
							)
						})
					)}
				</ul>
			</div>
		</div>,
		document.body
	)
}
