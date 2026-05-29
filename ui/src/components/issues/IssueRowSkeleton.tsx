interface IssueRowSkeletonProps {
	rows?: number
}

const TITLE_WIDTHS = ['62%', '78%', '48%', '70%', '55%']

export function IssueRowSkeleton({ rows = 5 }: IssueRowSkeletonProps) {
	return (
		<div role="status" aria-busy="true" aria-label="Loading issues" className="flex flex-col">
			<div className="group-head">
				<span className="skel" style={{ width: 80, height: 11 }} />
			</div>
			{Array.from({ length: rows }, (_, idx) => (
				<div className="skel-row" key={idx} aria-hidden="true">
					<span className="skel" style={{ width: 14, height: 14, borderRadius: '50%' }} />
					<span className="skel" style={{ width: 14, height: 14, borderRadius: '50%' }} />
					<span className="skel" style={{ width: 48 }} />
					<span className="skel" style={{ width: TITLE_WIDTHS[idx % TITLE_WIDTHS.length] }} />
				</div>
			))}
		</div>
	)
}
