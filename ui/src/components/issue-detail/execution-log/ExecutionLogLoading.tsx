export function ExecutionLogLoading() {
	return (
		<section
			aria-label="Execution log loading"
			role="status"
			className="execlog"
			style={{ padding: 'var(--space-6)' }}
		>
			<div className="skel" style={{ height: 24, width: '40%', marginBottom: 'var(--space-5)' }} />
			<div className="skel" style={{ height: 13, width: '100%', marginBottom: 'var(--space-3)' }} />
			<div className="skel" style={{ height: 13, width: '92%', marginBottom: 'var(--space-3)' }} />
			<div className="skel" style={{ height: 60, width: '100%', borderRadius: 'var(--radius-md)' }} />
		</section>
	)
}
