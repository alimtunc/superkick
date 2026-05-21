import { useEffect, useMemo, useRef, useState } from 'react'

import { CommandBarFooter } from '@/components/command/CommandBarFooter'
import { CommandBarHeader } from '@/components/command/CommandBarHeader'
import { ScopeChips } from '@/components/command/ScopeChips'
import { EmptySectionsView, buildEmptyRows } from '@/components/command/sections/EmptySectionsView'
import { ScopedSectionsView } from '@/components/command/sections/ScopedSectionsView'
import { TypingSectionsView } from '@/components/command/sections/TypingSectionsView'
import { DialogPopup } from '@/components/ui/dialog-shell'
import { useCommandBarKeyboard } from '@/hooks/useCommandBarKeyboard'
import { type CommandBarState, useCommandBarReducer } from '@/hooks/useCommandBarReducer'
import { useCommandSearch } from '@/hooks/useCommandSearch'
import { useDashboardRuns } from '@/hooks/useDashboardRuns'
import { useCommandBarStore } from '@/stores/commandBar'
import type { SearchResponse, SearchScope } from '@/types'
import { Dialog } from '@base-ui/react/dialog'
import { useRouter } from '@tanstack/react-router'

const EMPTY_RESULTS: SearchResponse = {
	issues: [],
	comments: [],
	files: [],
	runs: [],
	actions: [],
	total: 0
}

export function CommandBar() {
	const { open, openBar, closeBar, toggle } = useCommandBarStore()
	const router = useRouter()
	const reducer = useCommandBarReducer()
	const inputRef = useRef<HTMLInputElement>(null)
	const [includeDoneInScoped, setIncludeDoneInScoped] = useScopedDonePref()

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
				e.preventDefault()
				toggle()
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [toggle])

	useEffect(() => {
		if (!open) reducer.reset()
	}, [open, reducer])

	const search = useCommandSearch({
		query: reducer.effectiveQuery,
		scope: reducer.state.scope,
		includeDone: includeDoneInScoped,
		enabled: open
	})

	const dashboard = useDashboardRuns()
	const needsYou = useMemo(() => dashboard.needsAttention ?? [], [dashboard.needsAttention])

	const results = search.data ?? EMPTY_RESULTS
	const counts = useMemo(
		() => ({
			all: results.total,
			issues: results.issues.length,
			comments: results.comments.length,
			files: results.files.length,
			runs: results.runs.length,
			actions: results.actions.length
		}),
		[results]
	)

	const rowTargets = useMemo(
		() => flattenRows(reducer.state, reducer.mode, results, needsYou, includeDoneInScoped),
		[reducer.state, reducer.mode, results, needsYou, includeDoneInScoped]
	)
	const itemCount = rowTargets.length

	function handleActivate(targetOrNull: string | null) {
		if (targetOrNull) {
			void router.navigate({ to: targetOrNull })
		}
		closeBar()
	}

	function handleEmptyActivate(target: string) {
		if (target) void router.navigate({ to: target })
		closeBar()
	}

	function handleSelectIdx(idx: number, modifier: 'enter' | 'cmdEnter') {
		if (modifier === 'cmdEnter') {
			void router.navigate({ to: `/tasks/new?prefill=${encodeURIComponent(reducer.effectiveQuery)}` })
			closeBar()
			return
		}
		handleActivate(rowTargets[idx] ?? null)
	}

	const onKeyDown = useCommandBarKeyboard({
		reducer,
		itemCount,
		onActivate: handleSelectIdx,
		onClose: closeBar
	})

	return (
		<Dialog.Root open={open} onOpenChange={(v) => (v ? openBar() : closeBar())}>
			<DialogPopup
				align="top"
				initialFocus={inputRef}
				popupClassName="z-command w-full max-w-[580px] overflow-hidden rounded-[10px] border border-border bg-overlay shadow-2xl"
			>
				<Dialog.Title className="sr-only">Command bar</Dialog.Title>
				<div className="flex max-h-155 min-h-105 flex-col">
					<CommandBarHeader
						value={reducer.state.rawQuery}
						scope={reducer.state.scope}
						scopePinned={reducer.state.scopePinned}
						onChange={reducer.setQuery}
						onKeyDown={onKeyDown}
						onClearScope={() => reducer.setScope('all')}
						inputRef={inputRef}
					/>
					{reducer.mode === 'typing' ? (
						<ScopeChips
							active={reducer.state.scope}
							counts={counts}
							onPick={(s) => reducer.setScope(s)}
						/>
					) : null}
					<div className="flex-1 overflow-y-auto" role="listbox" aria-label="Search results">
						{reducer.mode === 'empty' ? (
							<EmptySectionsView
								needsYou={needsYou}
								selectedIdx={reducer.state.selectedIdx}
								onSelect={reducer.setSelected}
								onActivate={handleEmptyActivate}
							/>
						) : reducer.mode === 'typing' ? (
							<TypingSectionsView
								results={results}
								query={reducer.effectiveQuery}
								selectedIdx={reducer.state.selectedIdx}
								onSelect={reducer.setSelected}
								onActivate={handleActivate}
								onViewAll={(section) => {
									const targetScope: SearchScope = section
									reducer.setScope(targetScope)
								}}
							/>
						) : (
							<ScopedSectionsView
								scope={reducer.state.scope as Exclude<SearchScope, 'all'>}
								results={results}
								query={reducer.effectiveQuery}
								selectedIdx={reducer.state.selectedIdx}
								includeDone={includeDoneInScoped}
								onSelect={reducer.setSelected}
								onActivate={handleActivate}
								onToggleDone={() => setIncludeDoneInScoped((v) => !v)}
							/>
						)}
					</div>
					<CommandBarFooter resultCount={itemCount} />
				</div>
			</DialogPopup>
		</Dialog.Root>
	)
}

function useScopedDonePref(): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
	const STORAGE_KEY = 'superkick.search.showDoneInScoped'
	const [value, setValue] = useState<boolean>(() => {
		if (typeof window === 'undefined') return false
		return window.localStorage.getItem(STORAGE_KEY) === 'true'
	})
	useEffect(() => {
		if (typeof window === 'undefined') return
		window.localStorage.setItem(STORAGE_KEY, String(value))
	}, [value])
	return [value, setValue]
}

const SECTION_LIMIT = 5

function flattenRows(
	state: CommandBarState,
	mode: 'empty' | 'typing' | 'scoped',
	results: SearchResponse,
	needsYou: import('@/types').Run[],
	includeDone: boolean
): (string | null)[] {
	if (mode === 'empty') {
		return buildEmptyRows(needsYou).map((r) => r.target || null)
	}
	if (mode === 'typing') {
		const out: (string | null)[] = []
		for (const a of results.actions.slice(0, SECTION_LIMIT)) out.push(a.target ?? null)
		for (const i of results.issues.slice(0, SECTION_LIMIT)) out.push(`/issues/${i.id}`)
		for (const c of results.comments.slice(0, SECTION_LIMIT)) out.push(`/issues/${c.issueId}`)
		for (const _ of results.files.slice(0, SECTION_LIMIT)) out.push(null)
		for (const r of results.runs.slice(0, SECTION_LIMIT)) out.push(`/runs/${r.runId}`)
		return out
	}
	switch (state.scope) {
		case 'issues': {
			const open = results.issues.filter((i) => !isDone(i.stateType))
			const done = includeDone ? results.issues.filter((i) => isDone(i.stateType)) : []
			return [...open, ...done].map((i) => `/issues/${i.id}`)
		}
		case 'comments':
			return results.comments.map((c) => `/issues/${c.issueId}`)
		case 'files':
			return results.files.map(() => null)
		case 'runs':
			return results.runs.map((r) => `/runs/${r.runId}`)
		case 'actions':
			return results.actions.map((a) => a.target ?? null)
		default:
			return []
	}
}

function isDone(stateType: string): boolean {
	return stateType === 'completed' || stateType === 'canceled'
}
