import type { ActivityPayload } from '@/components/run-tabs/structuredActivity'

export function ActivityTestOutput({ tests }: { tests?: ActivityPayload['tests'] }) {
	if (!tests || tests.length === 0) return null
	return (
		<div className="terminal mt-2">
			{tests.map((test) => (
				<div key={test.name} className="grid grid-cols-[42px_1fr_auto] gap-3">
					<span className="c-accent">RUN</span>
					<span className="c-fg truncate">{test.name}</span>
					<span className={test.result === 'fail' ? 'c-danger' : 'c-success'}>{test.result}</span>
				</div>
			))}
		</div>
	)
}
