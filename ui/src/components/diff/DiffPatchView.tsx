import {
	type CSSProperties,
	type FormEvent,
	type ReactNode,
	useCallback,
	useMemo,
	useReducer,
	useState
} from 'react'

import { langFromPath } from '@/lib/diff/lang'
import { effectiveDiffMode } from '@/lib/diff/mode'
import type {
	DiffPatchReview,
	DiffReviewAnchor,
	DiffReviewLineSide,
	DiffReviewThread,
	DiffViewMode
} from '@/types'

import '@git-diff-view/react/styles/diff-view.css'

import {
	DiffModeEnum,
	DiffView,
	DiffViewWithMultiSelect,
	SplitSide,
	type DiffFile,
	type DiffViewProps
} from '@git-diff-view/react'

const DIFF_MULTI_SELECT_STYLE = {
	'--diff-multi-select-bg': 'var(--accent)',
	'--diff-multi-select-border': 'var(--accent)'
} as CSSProperties

interface ReviewLineData {
	threads: DiffReviewThread[]
}

type ReviewWidgetRenderer = (props: {
	diffFile: DiffFile
	side: SplitSide
	lineNumber: number
	fromLineNumber: number
	onClose: () => void
}) => ReactNode

interface DiffPatchViewProps {
	patch: string
	path: string
	oldPath?: string | null
	mode: DiffViewMode
	/** Deletions in this file; split view falls back to unified when there are
	 *  none (side-by-side adds nothing for a pure-addition file). */
	deletions: number
	review?: DiffPatchReview
}

/**
 * Renders one file's raw unified-diff `patch` with hunks, line numbers, and
 * syntax highlighting. Lazy-loaded so `@git-diff-view/react` + its highlighter
 * (incl. `DiffModeEnum`) stay out of the main bundle until a file is rendered.
 * Layout mode is driven by the parent so the whole list toggles at once.
 */
export function DiffPatchView({ patch, path, oldPath, mode, deletions, review }: DiffPatchViewProps) {
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
	const extendData = useMemo<DiffViewProps<ReviewLineData>['extendData']>(
		() => (review ? buildExtendData(review.threads) : undefined),
		[review]
	)
	const renderWidgetLine = useCallback<ReviewWidgetRenderer>(
		({ diffFile, side, lineNumber, fromLineNumber, onClose }) => {
			if (!review) return null
			return (
				<ReviewComposer
					review={review}
					diffFile={diffFile}
					side={side}
					fromLineNumber={fromLineNumber}
					lineNumber={lineNumber}
					onClose={onClose}
				/>
			)
		},
		[review]
	)
	const renderExtendLine = useCallback<NonNullable<DiffViewProps<ReviewLineData>['renderExtendLine']>>(
		({ data: lineData }) => (review ? <ReviewThreads data={lineData} review={review} /> : null),
		[review]
	)

	return (
		<div className="overflow-hidden rounded-[4px] border border-(--border-faint)">
			<div className="overflow-x-auto text-[12px]">
				{review ? (
					<DiffViewWithMultiSelect<ReviewLineData>
						data={data}
						extendData={extendData}
						diffViewMode={diffViewMode}
						diffViewHighlight
						diffViewWrap={false}
						diffViewTheme="dark"
						diffViewFontSize={12}
						diffViewAddWidget
						enableMultiSelect
						style={DIFF_MULTI_SELECT_STYLE}
						renderWidgetLine={renderWidgetLine}
						renderExtendLine={renderExtendLine}
					/>
				) : (
					<DiffView<ReviewLineData>
						data={data}
						extendData={extendData}
						diffViewMode={diffViewMode}
						diffViewHighlight
						diffViewWrap={false}
						diffViewTheme="dark"
						diffViewFontSize={12}
						diffViewAddWidget={false}
						renderExtendLine={undefined}
					/>
				)}
			</div>
		</div>
	)
}

function ReviewComposer({
	review,
	diffFile,
	side,
	fromLineNumber,
	lineNumber,
	onClose
}: {
	review: DiffPatchReview
	diffFile: DiffFile
	side: SplitSide
	fromLineNumber: number
	lineNumber: number
	onClose: () => void
}) {
	const [body, setBody] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const trimmed = body.trim()

	const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		if (!trimmed) return
		setIsSubmitting(true)
		setError(null)
		try {
			await review.onCreateThread(
				anchorForWidget(review, diffFile, side, fromLineNumber, lineNumber),
				trimmed
			)
			setBody('')
			onClose()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unable to save review comment')
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<form onSubmit={onSubmit} className="m-2 rounded-[4px] border border-border bg-canvas p-2 shadow-sm">
			<label className="block text-[11px] font-medium text-fg-dim" htmlFor="review-comment">
				{reviewComposerLabel(fromLineNumber, lineNumber)}
			</label>
			<textarea
				id="review-comment"
				aria-label="Review comment"
				value={body}
				onChange={(event) => setBody(event.target.value)}
				rows={3}
				className="mt-1 w-full resize-y rounded-[3px] border border-border bg-surface px-2 py-1 text-[12px] text-fg outline-none focus:border-accent focus-visible:ring-1 focus-visible:ring-accent"
			/>
			{error ? <p className="mt-1 text-[11px] text-danger">{error}</p> : null}
			<div className="mt-2 flex justify-end gap-2">
				<button
					type="button"
					onClick={onClose}
					className="rounded-[3px] px-2 py-1 text-[11px] text-fg-dim hover:bg-surface hover:text-fg focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={isSubmitting || !trimmed}
					className="rounded-[3px] bg-accent px-2 py-1 text-[11px] font-medium text-canvas focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				>
					Save comment
				</button>
			</div>
		</form>
	)
}

function ReviewThreads({ data, review }: { data: ReviewLineData; review: DiffPatchReview }) {
	return (
		<div className="space-y-2 bg-canvas px-3 py-2">
			{data.threads.map((thread) => (
				<ReviewThreadCard key={thread.id} thread={thread} review={review} />
			))}
		</div>
	)
}

function ReviewThreadCard({ thread, review }: { thread: DiffReviewThread; review: DiffPatchReview }) {
	const [state, dispatch] = useReducer(reviewThreadCardReducer, INITIAL_REVIEW_THREAD_CARD_STATE)
	const trimmed = state.reply.trim()
	const resolved = thread.state === 'resolved'

	const onReply = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		if (!trimmed) return
		dispatch({ type: 'reply-start' })
		try {
			await review.onReply(thread.id, trimmed)
			dispatch({ type: 'reply-success' })
		} catch (err) {
			dispatch({
				type: 'reply-error',
				message: err instanceof Error ? err.message : 'Unable to save reply'
			})
		}
	}

	const onResolve = async () => {
		dispatch({ type: 'action-start', action: 'resolve' })
		try {
			await review.onResolve(thread.id, !resolved)
		} catch (err) {
			dispatch({
				type: 'action-error',
				message: err instanceof Error ? err.message : 'Unable to update review thread'
			})
		} finally {
			dispatch({ type: 'action-complete' })
		}
	}

	const onDelete = async () => {
		const confirmed = globalThis.confirm?.('Delete this review thread?') ?? true
		if (!confirmed) return
		dispatch({ type: 'action-start', action: 'delete' })
		try {
			await review.onDeleteThread(thread.id)
		} catch (err) {
			dispatch({
				type: 'action-error',
				message: err instanceof Error ? err.message : 'Unable to delete review thread'
			})
		} finally {
			dispatch({ type: 'action-complete' })
		}
	}

	return (
		<div className="rounded-[4px] border border-border bg-surface p-2 text-[12px] text-fg">
			<div className="flex items-center gap-2 text-[11px] text-fg-dim">
				<span>{thread.author}</span>
				<span aria-hidden="true">·</span>
				<span>{resolved ? 'resolved' : 'open'}</span>
				<div className="ml-auto flex gap-1">
					<button
						type="button"
						onClick={onResolve}
						disabled={state.pendingAction !== null}
						className="rounded-[3px] px-2 py-0.5 text-[11px] hover:bg-canvas hover:text-fg focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					>
						{resolved ? 'Reopen thread' : 'Resolve thread'}
					</button>
					<button
						type="button"
						onClick={onDelete}
						disabled={state.pendingAction !== null}
						className="rounded-[3px] px-2 py-0.5 text-[11px] text-danger hover:bg-canvas focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					>
						Delete thread
					</button>
				</div>
			</div>
			<div className="mt-2 space-y-2">
				{thread.comments.map((comment) => (
					<p key={comment.id} className="leading-5 whitespace-pre-wrap">
						{comment.body}
					</p>
				))}
			</div>
			<form onSubmit={onReply} className="mt-2 flex gap-2">
				<label className="sr-only" htmlFor={`reply-${thread.id}`}>
					Reply to thread
				</label>
				<input
					id={`reply-${thread.id}`}
					aria-label="Reply to thread"
					value={state.reply}
					onChange={(event) => dispatch({ type: 'reply-change', value: event.target.value })}
					className="min-w-0 flex-1 rounded-[3px] border border-border bg-canvas px-2 py-1 text-[12px] outline-none focus:border-accent focus-visible:ring-1 focus-visible:ring-accent"
				/>
				<button
					type="submit"
					disabled={state.isSubmitting || !trimmed}
					className="rounded-[3px] border border-border px-2 py-1 text-[11px] text-fg-dim hover:text-fg focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				>
					Reply
				</button>
			</form>
			{state.error ? <p className="mt-1 text-[11px] text-danger">{state.error}</p> : null}
			{state.actionError ? <p className="mt-1 text-[11px] text-danger">{state.actionError}</p> : null}
		</div>
	)
}

type ReviewThreadPendingAction = 'resolve' | 'delete'

interface ReviewThreadCardState {
	reply: string
	error: string | null
	actionError: string | null
	pendingAction: ReviewThreadPendingAction | null
	isSubmitting: boolean
}

type ReviewThreadCardAction =
	| { type: 'reply-change'; value: string }
	| { type: 'reply-start' }
	| { type: 'reply-success' }
	| { type: 'reply-error'; message: string }
	| { type: 'action-start'; action: ReviewThreadPendingAction }
	| { type: 'action-error'; message: string }
	| { type: 'action-complete' }

const INITIAL_REVIEW_THREAD_CARD_STATE: ReviewThreadCardState = {
	reply: '',
	error: null,
	actionError: null,
	pendingAction: null,
	isSubmitting: false
}

function reviewThreadCardReducer(
	state: ReviewThreadCardState,
	action: ReviewThreadCardAction
): ReviewThreadCardState {
	switch (action.type) {
		case 'reply-change':
			return { ...state, reply: action.value }
		case 'reply-start':
			return { ...state, error: null, isSubmitting: true }
		case 'reply-success':
			return { ...state, reply: '', error: null, isSubmitting: false }
		case 'reply-error':
			return { ...state, error: action.message, isSubmitting: false }
		case 'action-start':
			return { ...state, actionError: null, pendingAction: action.action }
		case 'action-error':
			return { ...state, actionError: action.message }
		case 'action-complete':
			return { ...state, pendingAction: null }
	}
}

function buildExtendData(threads: DiffReviewThread[]): DiffViewProps<ReviewLineData>['extendData'] {
	const oldFile: Record<string, { data: ReviewLineData }> = {}
	const newFile: Record<string, { data: ReviewLineData }> = {}
	for (const thread of threads) {
		const target = extendTargetForThread(thread)
		if (!target) continue
		const bucket = target.file === 'old' ? oldFile : newFile
		const key = String(target.line)
		bucket[key] = {
			data: {
				threads: [...(bucket[key]?.data.threads ?? []), thread]
			}
		}
	}
	return { oldFile, newFile }
}

function extendTargetForThread(thread: DiffReviewThread): { file: 'old' | 'new'; line: number } | null {
	if (thread.anchor.side === 'old' && thread.anchor.oldLine) {
		return { file: 'old', line: thread.anchor.oldLine }
	}
	if (thread.anchor.side === 'new' && thread.anchor.newLine) {
		return { file: 'new', line: thread.anchor.newLine }
	}
	if (thread.anchor.newLine) {
		return { file: 'new', line: thread.anchor.newLine }
	}
	if (thread.anchor.oldLine) {
		return { file: 'old', line: thread.anchor.oldLine }
	}
	return null
}

function anchorForWidget(
	review: DiffPatchReview,
	diffFile: DiffFile,
	side: SplitSide,
	fromLineNumber: number,
	lineNumber: number
): DiffReviewAnchor {
	const startLineNumber = Math.min(fromLineNumber, lineNumber)
	const endLineNumber = Math.max(fromLineNumber, lineNumber)
	const lines = lineNumbersForWidget(diffFile, side, startLineNumber)
	const endLines = lineNumbersForWidget(diffFile, side, endLineNumber)
	const reviewSide = reviewSideForLines(side, lines.oldLine, lines.newLine)
	return {
		runId: review.runId,
		filePath: review.filePath,
		oldPath: review.oldPath ?? null,
		side: reviewSide,
		oldLine: lines.oldLine,
		oldLineEnd: rangeEnd(lines.oldLine, endLines.oldLine),
		newLine: lines.newLine,
		newLineEnd: rangeEnd(lines.newLine, endLines.newLine),
		hunkHeader: null,
		hunkIndex: null,
		baseRef: review.baseRef,
		headRef: review.headRef
	}
}

function rangeEnd(start: number | null, end: number | null): number | null {
	if (start === null || end === null || end <= start) return null
	return end
}

function lineNumbersForWidget(
	diffFile: DiffFile,
	side: SplitSide,
	lineNumber: number
): { oldLine: number | null; newLine: number | null } {
	try {
		const line = diffFile.getUnifiedLineByLineNumber(lineNumber, side)
		const oldLine = positiveLine(line.oldLineNumber)
		const newLine = positiveLine(line.newLineNumber)
		if (oldLine !== null || newLine !== null) {
			return { oldLine, newLine }
		}
	} catch {
		// Fall back to the pane side if the diff library cannot resolve the line.
	}

	return side === SplitSide.old
		? { oldLine: positiveLine(lineNumber), newLine: null }
		: { oldLine: null, newLine: positiveLine(lineNumber) }
}

function positiveLine(line: number | undefined): number | null {
	return typeof line === 'number' && line > 0 ? line : null
}

function reviewSideForLines(
	side: SplitSide,
	oldLine: number | null,
	newLine: number | null
): DiffReviewLineSide {
	if (oldLine !== null && newLine !== null) return 'context'
	if (oldLine !== null) return 'old'
	if (newLine !== null) return 'new'
	return sideToReviewSide(side)
}

function sideToReviewSide(side: SplitSide): DiffReviewLineSide {
	return side === SplitSide.old ? 'old' : 'new'
}

function reviewComposerLabel(fromLineNumber: number, lineNumber: number): string {
	return fromLineNumber === lineNumber ? 'Review comment' : 'Review comment for selected lines'
}
