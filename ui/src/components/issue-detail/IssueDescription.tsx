import { SectionTitle } from '@/components/dashboard/SectionTitle'

export function IssueDescription({ description }: { description: string }) {
	if (!description.trim()) return null

	return (
		<section className="mb-6">
			<SectionTitle title="DESCRIPTION" />
			<div className="rounded-md border border-edge bg-graphite p-4">
				<div className="text-sm leading-relaxed whitespace-pre-wrap text-silver">{description}</div>
			</div>
		</section>
	)
}
