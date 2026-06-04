import { useMemo } from 'react'

import { langFromPath } from '@/lib/diff/lang'
import { effectiveDiffMode } from '@/lib/diff/mode'
import type { DiffViewMode } from '@/types'

import '@git-diff-view/react/styles/diff-view.css'

import { DiffModeEnum, DiffView } from '@git-diff-view/react'

interface DiffPatchViewProps {
	patch: string
	path: string
	oldPath?: string | null
	mode: DiffViewMode
	/** Deletions in this file; split view falls back to unified when there are
	 *  none (side-by-side adds nothing for a pure-addition file). */
	deletions: number
}

/**
 * Renders one file's raw unified-diff `patch` with hunks, line numbers, and
 * syntax highlighting. Lazy-loaded so `@git-diff-view/react` + its highlighter
 * (incl. `DiffModeEnum`) stay out of the main bundle until a file is rendered.
 * Layout mode is driven by the parent so the whole list toggles at once.
 */
export function DiffPatchView({ patch, path, oldPath, mode, deletions }: DiffPatchViewProps) {
	const lang = langFromPath(path)

	const data = useMemo(
		() => ({
			oldFile: { fileName: oldPath ?? path, fileLang: lang },
			newFile: { fileName: path, fileLang: lang },
			hunks: [patch]
		}),
		[patch, path, oldPath, lang]
	)

	const diffViewMode =
		effectiveDiffMode(mode, deletions) === 'split' ? DiffModeEnum.Split : DiffModeEnum.Unified

	return (
		<div className="overflow-hidden rounded-[4px] border border-(--border-faint)">
			<div className="overflow-x-auto text-[12px]">
				<DiffView
					data={data}
					diffViewMode={diffViewMode}
					diffViewHighlight
					diffViewWrap={false}
					diffViewTheme="dark"
					diffViewFontSize={12}
				/>
			</div>
		</div>
	)
}
