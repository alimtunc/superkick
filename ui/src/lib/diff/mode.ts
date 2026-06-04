import type { DiffViewMode } from '@/types'

/** Resolve the per-file layout: split only when the operator chose it AND the
 *  file has deletions. A pure addition has nothing to put on the left side, so
 *  side-by-side wastes space — fall back to unified. */
export function effectiveDiffMode(mode: DiffViewMode, deletions: number): DiffViewMode {
	return mode === 'split' && deletions > 0 ? 'split' : 'unified'
}
