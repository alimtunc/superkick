import { useEffect, useMemo, useRef } from 'react'

import { DialogPopup } from '@/components/composites/dialog-shell'
import { CommandBarFooter } from '@/domains/command/components/CommandBarFooter'
import { CommandBarHeader } from '@/domains/command/components/CommandBarHeader'
import { flattenRows } from '@/domains/command/components/flattenRows'
import { ScopeChips } from '@/domains/command/components/ScopeChips'
import { EmptySectionsView } from '@/domains/command/components/sections/EmptySectionsView'
import { ScopedSectionsView } from '@/domains/command/components/sections/ScopedSectionsView'
import { TypingSectionsView } from '@/domains/command/components/sections/TypingSectionsView'
import { useCommandBarKeyboard } from '@/hooks/useCommandBarKeyboard'
import { useCommandBarReducer } from '@/hooks/useCommandBarReducer'
import { useCommandSearch } from '@/hooks/useCommandSearch'
import { useDashboardRuns } from '@/hooks/useDashboardRuns'
import { useScopedDonePref } from '@/hooks/useScopedDonePref'
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
		includeDone: reducer.state.scope === 'issues' ? true : includeDoneInScoped,
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
				popupClassName="z-command w-full max-w-[560px] overflow-hidden rounded-[14px] border border-border-strong bg-overlay shadow-[var(--shadow-lg)]"
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
					<div className="flex-1 overflow-y-auto px-2" role="listbox" aria-label="Search results">
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
						) : reducer.state.scope !== 'all' ? (
							<ScopedSectionsView
								scope={reducer.state.scope}
								results={results}
								query={reducer.effectiveQuery}
								selectedIdx={reducer.state.selectedIdx}
								includeDone={includeDoneInScoped}
								onSelect={reducer.setSelected}
								onActivate={handleActivate}
								onToggleDone={() => setIncludeDoneInScoped((v) => !v)}
							/>
						) : null}
					</div>
					<CommandBarFooter resultCount={itemCount} />
				</div>
			</DialogPopup>
		</Dialog.Root>
	)
}
