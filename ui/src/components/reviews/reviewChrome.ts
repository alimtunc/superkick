import type { PrReviewTab } from '@/types'

/** Compact bordered chip shared by the review header's link/action affordances. */
export const REVIEW_CHIP_CLASS =
	'inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-fg-dim hover:bg-surface hover:text-fg'

export const reviewTabId = (tab: PrReviewTab) => `pr-tab-${tab}`
export const reviewPanelId = (tab: PrReviewTab) => `pr-tabpanel-${tab}`
