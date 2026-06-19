import { DiffPatchView } from '@/domains/diff/components/DiffPatchView'
import type { DiffReviewThread } from '@/types'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@git-diff-view/react', async () => {
	const React = await vi.importActual<typeof import('react')>('react')
	const SplitSide = { old: 1, new: 2 }
	const DiffModeEnum = { Unified: 'unified', Split: 'split' }
	return {
		DiffModeEnum,
		SplitSide,
		DiffView: (props: {
			diffViewAddWidget?: boolean
			renderWidgetLine?: (input: {
				diffFile: unknown
				side: number
				lineNumber: number
				onClose: () => void
			}) => React.ReactNode
			renderExtendLine?: (input: {
				diffFile: unknown
				side: number
				lineNumber: number
				data: unknown
				onUpdate: () => void
			}) => React.ReactNode
			extendData?: {
				oldFile?: Record<string, { data: unknown }>
				newFile?: Record<string, { data: unknown }>
			}
		}) => {
			const [widgetOpen, setWidgetOpen] = React.useState(false)
			const [contextWidgetOpen, setContextWidgetOpen] = React.useState(false)
			const newLineDiffFile = {
				getUnifiedLineByLineNumber: () => ({ newLineNumber: 2 })
			}
			const contextLineDiffFile = {
				getUnifiedLineByLineNumber: () => ({ oldLineNumber: 2, newLineNumber: 2 })
			}
			return (
				<div>
					{props.diffViewAddWidget ? (
						<>
							<button type="button" onClick={() => setWidgetOpen(true)}>
								Add comment to new line 2
							</button>
							<button type="button" onClick={() => setContextWidgetOpen(true)}>
								Add comment to context line 2
							</button>
						</>
					) : null}
					{widgetOpen && props.renderWidgetLine
						? props.renderWidgetLine({
								diffFile: newLineDiffFile,
								side: SplitSide.new,
								lineNumber: 2,
								onClose: () => setWidgetOpen(false)
							})
						: null}
					{contextWidgetOpen && props.renderWidgetLine
						? props.renderWidgetLine({
								diffFile: contextLineDiffFile,
								side: SplitSide.new,
								lineNumber: 2,
								onClose: () => setContextWidgetOpen(false)
							})
						: null}
					{props.extendData?.newFile?.['2'] && props.renderExtendLine
						? props.renderExtendLine({
								diffFile: {},
								side: SplitSide.new,
								lineNumber: 2,
								data: props.extendData.newFile['2'].data,
								onUpdate: vi.fn()
							})
						: null}
				</div>
			)
		},
		DiffViewWithMultiSelect: (props: {
			diffViewAddWidget?: boolean
			renderWidgetLine?: (input: {
				diffFile: unknown
				side: number
				lineNumber: number
				fromLineNumber: number
				onClose: () => void
			}) => React.ReactNode
			renderExtendLine?: (input: {
				diffFile: unknown
				side: number
				lineNumber: number
				data: unknown
				onUpdate: () => void
			}) => React.ReactNode
			extendData?: {
				oldFile?: Record<string, { data: unknown }>
				newFile?: Record<string, { data: unknown }>
			}
		}) => {
			const [widget, setWidget] = React.useState<{
				side: number
				lineNumber: number
				fromLineNumber: number
				diffFile: unknown
			} | null>(null)
			const rangeDiffFile = {
				getUnifiedLineByLineNumber: (lineNumber: number) => ({ newLineNumber: lineNumber })
			}
			const contextRangeDiffFile = {
				getUnifiedLineByLineNumber: (lineNumber: number) => ({
					oldLineNumber: lineNumber,
					newLineNumber: lineNumber
				})
			}
			return (
				<div>
					{props.diffViewAddWidget ? (
						<>
							<button
								type="button"
								onClick={() =>
									setWidget({
										side: SplitSide.new,
										fromLineNumber: 2,
										lineNumber: 2,
										diffFile: rangeDiffFile
									})
								}
							>
								Add comment to new line 2
							</button>
							<button
								type="button"
								onClick={() =>
									setWidget({
										side: SplitSide.new,
										fromLineNumber: 2,
										lineNumber: 2,
										diffFile: contextRangeDiffFile
									})
								}
							>
								Add comment to context line 2
							</button>
							<button
								type="button"
								onClick={() =>
									setWidget({
										side: SplitSide.new,
										fromLineNumber: 2,
										lineNumber: 4,
										diffFile: rangeDiffFile
									})
								}
							>
								Add comment to new lines 2-4
							</button>
						</>
					) : null}
					{widget && props.renderWidgetLine
						? props.renderWidgetLine({
								diffFile: widget.diffFile,
								side: widget.side,
								lineNumber: widget.lineNumber,
								fromLineNumber: widget.fromLineNumber,
								onClose: () => setWidget(null)
							})
						: null}
					{props.extendData?.newFile?.['2'] && props.renderExtendLine
						? props.renderExtendLine({
								diffFile: {},
								side: SplitSide.new,
								lineNumber: 2,
								data: props.extendData.newFile['2'].data,
								onUpdate: vi.fn()
							})
						: null}
				</div>
			)
		}
	}
})

function thread(overrides: Partial<DiffReviewThread> = {}): DiffReviewThread {
	return {
		id: 'thread-1',
		anchor: {
			subject: { type: 'run', runId: 'run-1' },
			issueId: 'issue-1',
			filePath: 'src/foo.ts',
			oldPath: null,
			side: 'new',
			oldLine: null,
			newLine: 2,
			hunkHeader: '@@ -1,2 +1,3 @@',
			hunkIndex: 0,
			baseRef: 'abc1234',
			headRef: 'def5678'
		},
		state: 'open',
		author: 'operator',
		createdAt: '2026-06-11T20:00:00.000Z',
		updatedAt: '2026-06-11T20:00:00.000Z',
		comments: [
			{
				id: 'comment-1',
				threadId: 'thread-1',
				author: 'operator',
				body: 'Please simplify this branch.',
				createdAt: '2026-06-11T20:00:00.000Z',
				updatedAt: '2026-06-11T20:00:00.000Z'
			}
		],
		...overrides
	}
}

describe('DiffPatchView review hooks', () => {
	it('creates an anchored review thread from the inline composer', async () => {
		const createThread = vi.fn().mockResolvedValue(undefined)
		const user = userEvent.setup()

		render(
			<DiffPatchView
				patch="@@ -1,2 +1,3 @@\n line\n+added"
				path="src/foo.ts"
				mode="unified"
				review={{
					subject: { type: 'run', runId: 'run-1' },
					filePath: 'src/foo.ts',
					oldPath: null,
					baseRef: 'abc1234',
					headRef: 'def5678',
					threads: [],
					onCreateThread: createThread,
					onReply: vi.fn(),
					onResolve: vi.fn(),
					onDeleteThread: vi.fn()
				}}
			/>
		)

		await user.click(screen.getByRole('button', { name: 'Add comment to new line 2' }))
		await user.type(screen.getByLabelText('Review comment'), 'Please simplify this branch.')
		await user.click(screen.getByRole('button', { name: 'Save comment' }))

		await waitFor(() => expect(createThread).toHaveBeenCalledTimes(1))
		expect(createThread).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: 'src/foo.ts',
				side: 'new',
				newLine: 2,
				baseRef: 'abc1234',
				headRef: 'def5678'
			}),
			'Please simplify this branch.'
		)
	})

	it('anchors unchanged context lines to old and new line numbers', async () => {
		const createThread = vi.fn().mockResolvedValue(undefined)
		const user = userEvent.setup()

		render(
			<DiffPatchView
				patch="@@ -1,2 +1,3 @@\n line\n+added"
				path="src/foo.ts"
				mode="unified"
				review={{
					subject: { type: 'run', runId: 'run-1' },
					filePath: 'src/foo.ts',
					oldPath: null,
					baseRef: 'abc1234',
					headRef: 'def5678',
					threads: [],
					onCreateThread: createThread,
					onReply: vi.fn(),
					onResolve: vi.fn(),
					onDeleteThread: vi.fn()
				}}
			/>
		)

		await user.click(screen.getByRole('button', { name: 'Add comment to context line 2' }))
		await user.type(screen.getByLabelText('Review comment'), 'This context needs the same guard.')
		await user.click(screen.getByRole('button', { name: 'Save comment' }))

		await waitFor(() => expect(createThread).toHaveBeenCalledTimes(1))
		expect(createThread).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: 'src/foo.ts',
				side: 'context',
				oldLine: 2,
				newLine: 2,
				baseRef: 'abc1234',
				headRef: 'def5678'
			}),
			'This context needs the same guard.'
		)
	})

	it('creates a multi-line review thread from a selected line range', async () => {
		const createThread = vi.fn().mockResolvedValue(undefined)
		const user = userEvent.setup()

		render(
			<DiffPatchView
				patch="@@ -1,4 +1,5 @@\n line\n+added\n+more\n+done"
				path="src/foo.ts"
				mode="unified"
				review={{
					subject: { type: 'run', runId: 'run-1' },
					filePath: 'src/foo.ts',
					oldPath: null,
					baseRef: 'abc1234',
					headRef: 'def5678',
					threads: [],
					onCreateThread: createThread,
					onReply: vi.fn(),
					onResolve: vi.fn(),
					onDeleteThread: vi.fn()
				}}
			/>
		)

		await user.click(screen.getByRole('button', { name: 'Add comment to new lines 2-4' }))
		await user.type(screen.getByLabelText('Review comment'), 'This range should be extracted.')
		await user.click(screen.getByRole('button', { name: 'Save comment' }))

		await waitFor(() => expect(createThread).toHaveBeenCalledTimes(1))
		expect(createThread).toHaveBeenCalledWith(
			expect.objectContaining({
				filePath: 'src/foo.ts',
				side: 'new',
				newLine: 2,
				newLineEnd: 4,
				baseRef: 'abc1234',
				headRef: 'def5678'
			}),
			'This range should be extracted.'
		)
	})

	it('renders existing review threads under their anchored line', () => {
		render(
			<DiffPatchView
				patch="@@ -1,2 +1,3 @@\n line\n+added"
				path="src/foo.ts"
				mode="unified"
				review={{
					subject: { type: 'run', runId: 'run-1' },
					filePath: 'src/foo.ts',
					oldPath: null,
					baseRef: 'abc1234',
					headRef: 'def5678',
					threads: [thread()],
					onCreateThread: vi.fn(),
					onReply: vi.fn(),
					onResolve: vi.fn(),
					onDeleteThread: vi.fn()
				}}
			/>
		)

		expect(screen.getByText('Please simplify this branch.')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Resolve thread' })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Delete thread' })).toBeInTheDocument()
	})
})
