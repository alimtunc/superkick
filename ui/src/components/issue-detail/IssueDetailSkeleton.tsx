const BODY_LINES = ['96%', '88%', '72%']
const RAIL_ROWS = [
	{ key: 'status', width: '66%' },
	{ key: 'priority', width: '54%' },
	{ key: 'assignee', width: '72%' },
	{ key: 'project', width: '48%' },
	{ key: 'labels', width: '60%' },
	{ key: 'estimate', width: '42%' }
]
const SECTION_ROWS = [
	{ key: 'first', width: '76%' },
	{ key: 'second', width: '58%' },
	{ key: 'third', width: '76%' },
	{ key: 'fourth', width: '58%' }
]

export function IssueDetailSkeleton() {
	return (
		<div className="detail" role="status" aria-busy="true" aria-label="Loading issue detail">
			<div className="detail__body">
				<div className="detail__inner">
					<div className="issue-head">
						<div className="issue-head__crumb" aria-hidden="true">
							<span className="skel" style={{ width: 58, height: 13 }} />
							<span className="skel" style={{ width: 14, height: 14, borderRadius: '50%' }} />
							<span className="skel" style={{ width: 96, height: 13 }} />
						</div>
						<div className="skel" style={{ width: 'min(680px, 86%)', height: 28 }} />
					</div>

					<div className="space-y-3" aria-hidden="true">
						{BODY_LINES.map((width) => (
							<div key={width} className="skel" style={{ width, height: 14 }} />
						))}
					</div>

					<SkeletonSection titleWidth={72} rows={3} />
					<SkeletonSection titleWidth={62} rows={4} />
				</div>
			</div>
			<aside aria-label="Issue rail" className="detail__rail">
				<div className="rail__group" aria-hidden="true">
					{RAIL_ROWS.map((row) => (
						<div className="prop" key={row.key}>
							<span className="skel" style={{ width: 54, height: 12 }} />
							<span className="skel" style={{ width: row.width, height: 13 }} />
						</div>
					))}
				</div>
				<div className="rail__footer" aria-hidden="true">
					<div className="skel" style={{ width: '72%', height: 12 }} />
					<div className="skel" style={{ width: '58%', height: 12 }} />
				</div>
			</aside>
		</div>
	)
}

interface SkeletonSectionProps {
	titleWidth: number
	rows: number
}

function SkeletonSection({ titleWidth, rows }: SkeletonSectionProps) {
	return (
		<>
			<div className="section-head" aria-hidden="true">
				<span className="skel" style={{ width: titleWidth, height: 12 }} />
				<span className="section-head__line" />
			</div>
			<div className="execlog" aria-hidden="true">
				{SECTION_ROWS.slice(0, rows).map((row) => (
					<div className="skel-row" key={row.key}>
						<span className="skel" style={{ width: 14, height: 14, borderRadius: '50%' }} />
						<span className="skel" style={{ width: 14, height: 14, borderRadius: '50%' }} />
						<span className="skel" style={{ width: 64 }} />
						<span className="skel" style={{ width: row.width }} />
					</div>
				))}
			</div>
		</>
	)
}
