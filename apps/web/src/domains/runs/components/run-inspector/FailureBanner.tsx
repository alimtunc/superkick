import { Icon } from '@/components/primitives'
export function FailureBanner({ message }: { message: string | null }) {
	return (
		<div
			role="alert"
			className="opbanner"
			style={{ background: 'var(--danger-soft)', borderColor: 'var(--danger)' }}
		>
			<span className="opbanner__icon" style={{ color: 'var(--danger)' }}>
				<Icon name="alert" size={18} className="ic" />
			</span>
			<div className="opbanner__body">
				<p className="opbanner__title">Run failed</p>
				{message ? (
					<p
						className="opbanner__q mono"
						style={{
							fontSize: 'var(--text-12)',
							background: 'var(--bg-code)',
							padding: 'var(--space-4) var(--space-5)',
							borderRadius: 'var(--radius-sm)',
							marginTop: 'var(--space-3)'
						}}
					>
						{message}
					</p>
				) : null}
			</div>
		</div>
	)
}
