import { filterIndexedFiles, scrollToFile } from '@/lib/diff/fileSections'
import { splitPath } from '@/lib/path'
import type { FileDiff } from '@/types'

interface DiffFileNavigatorProps {
	files: FileDiff[]
	filter: string
	onFilterChange: (filter: string) => void
	reviewedFiles: Set<string>
	unresolvedByFile: Map<string, number>
	sectionIdPrefix: string
	searchId: string
	showReview?: boolean
}

export function DiffFileNavigator({
	files,
	filter,
	onFilterChange,
	reviewedFiles,
	unresolvedByFile,
	sectionIdPrefix,
	searchId,
	showReview = true
}: DiffFileNavigatorProps) {
	const indexedFiles = filterIndexedFiles(files, filter)

	return (
		<aside className="flex h-full min-h-0 flex-col border-t border-border bg-canvas md:col-start-1 md:row-start-1 md:border-t-0 md:border-r">
			<div className="border-b border-border px-3 py-2">
				<label
					htmlFor={searchId}
					className="block text-[11px] font-medium tracking-[0.08em] text-fg-muted uppercase"
				>
					Files
				</label>
				<input
					id={searchId}
					type="search"
					value={filter}
					onChange={(event) => onFilterChange(event.target.value)}
					aria-label="Search changed files"
					placeholder="Search files"
					className="mt-2 h-7 w-full rounded-[4px] border border-border bg-surface px-2 font-mono text-[12px] text-fg outline-none placeholder:text-fg-dim focus:border-border-strong focus-visible:ring-2 focus-visible:ring-accent/40"
				/>
			</div>
			<div className="max-h-72 min-h-0 overflow-auto py-1 md:max-h-none">
				{indexedFiles.length === 0 ? (
					<p className="px-3 py-2 text-[12px] text-fg-muted">No matching files</p>
				) : null}
				{indexedFiles.map(({ file, index }) => {
					const unresolved = unresolvedByFile.get(file.path) ?? 0
					const reviewed = reviewedFiles.has(file.path)
					const { dir, name } = splitPath(file.path)
					return (
						<button
							key={file.path}
							type="button"
							onClick={() => scrollToFile(sectionIdPrefix, index)}
							aria-label={fileJumpLabel(file.path, unresolved, showReview)}
							className="group flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-fg-dim hover:bg-surface hover:text-fg focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
						>
							{showReview ? (
								<span
									className={
										reviewed
											? 'size-1.5 shrink-0 rounded-full bg-success'
											: 'size-1.5 shrink-0 rounded-full bg-border'
									}
									aria-hidden="true"
								/>
							) : null}
							<span className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
								<span
									className="max-w-[70%] shrink-0 truncate font-mono text-[12px] text-fg"
									title={file.path}
								>
									{name}
								</span>
								{dir ? (
									<span
										className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-fg-muted"
										title={file.path}
									>
										{trimTrailingSlash(dir)}
									</span>
								) : null}
							</span>
							<span className="flex shrink-0 items-center gap-1.5 pl-2 font-mono text-[10.5px] text-fg-muted">
								<span className="text-success">+{file.additions}</span>
								<span className="text-danger">−{file.deletions}</span>
								{showReview && unresolved > 0 ? (
									<span className="rounded bg-raised px-1 text-fg-dim">{unresolved}</span>
								) : null}
							</span>
						</button>
					)
				})}
			</div>
		</aside>
	)
}

function trimTrailingSlash(dir: string): string {
	return dir.endsWith('/') ? dir.slice(0, -1) : dir
}

function fileJumpLabel(filePath: string, unresolved: number, showReview: boolean): string {
	if (!showReview) return `Jump to ${filePath}`
	const suffix = unresolved === 1 ? 'comment' : 'comments'
	return `Jump to ${filePath}, ${unresolved} unresolved ${suffix}`
}
