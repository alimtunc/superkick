import { cn } from '@/lib/utils'

interface IssueRowSkeletonProps {
	rows?: number
}

const TITLE_WIDTHS = ['w-72', 'w-96', 'w-64', 'w-80', 'w-56']
const LABEL_WIDTHS = ['w-12', 'w-10']
const PROJECT_WIDTHS = ['w-16', 'w-20', 'w-12']

export function IssueRowSkeleton({ rows = 5 }: IssueRowSkeletonProps) {
	return (
		<div role="status" aria-busy="true" aria-label="Loading issues" className="flex flex-col">
			<SkeletonGroupHeader />
			{Array.from({ length: rows }, (_, idx) => (
				<SkeletonRow
					key={idx}
					title={TITLE_WIDTHS[idx % TITLE_WIDTHS.length]}
					label={LABEL_WIDTHS[idx % LABEL_WIDTHS.length]}
					project={PROJECT_WIDTHS[idx % PROJECT_WIDTHS.length]}
				/>
			))}
		</div>
	)
}

function SkeletonGroupHeader() {
	return (
		<div
			className="flex h-7 items-center gap-2 border-b border-border bg-surface px-5"
			aria-hidden="true"
		>
			<Pulse className="size-2 rounded-full" />
			<Pulse className="h-2.5 w-20 rounded-sm" />
			<Pulse className="h-2.5 w-6 rounded-sm" />
		</div>
	)
}

interface SkeletonRowProps {
	title: string
	label: string
	project: string
}

function SkeletonRow({ title, label, project }: SkeletonRowProps) {
	return (
		<div className="flex h-9 items-center gap-2.5 border-b border-border pr-6 pl-5" aria-hidden="true">
			<Pulse className="size-2.5 rounded-sm" />
			<Pulse className="size-3 rounded-full" />
			<Pulse className="h-2.5 w-12 rounded-sm" />
			<Pulse className={cn('h-2.5 rounded-sm', title)} />
			<span className="flex-1" />
			<Pulse className={cn('h-3.5 rounded-full', label)} />
			<Pulse className={cn('h-2.5 rounded-sm', project)} />
			<Pulse className="size-4.5 rounded-full" />
			<Pulse className="h-2.5 w-8 rounded-sm" />
			<Pulse className="size-1.5 rounded-full" />
		</div>
	)
}

function Pulse({ className }: { className?: string }) {
	return <span className={cn('inline-block animate-pulse bg-raised', className)} />
}
