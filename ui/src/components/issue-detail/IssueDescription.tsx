import { SectionTitle } from '@/components/dashboard/SectionTitle'

export function IssueDescription({ description }: { description: string }) {
	if (!description.trim()) return null

	return (
		<section className="mb-6">
			<SectionTitle title="DESCRIPTION" />
			<div className="panel p-4">
				<div className="font-data text-[12px] leading-relaxed whitespace-pre-wrap text-silver">
					{description}
				</div>
			</div>
		</section>
	)
}
