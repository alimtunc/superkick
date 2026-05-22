import type { ReactNode } from 'react'

import { InspectorSectionLabel } from '@/components/ui/inspector-section-label'

interface InspectorSectionProps {
	label: string
	children: ReactNode
}

export function InspectorSection({ label, children }: InspectorSectionProps) {
	return (
		<section>
			<InspectorSectionLabel>{label}</InspectorSectionLabel>
			{children}
		</section>
	)
}
