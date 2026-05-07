import type { ReactNode } from 'react'

import { SectionTitle } from '@/components/dashboard/SectionTitle'

interface LaunchTaskShellProps {
	children: ReactNode
}

export function LaunchTaskShell({ children }: LaunchTaskShellProps) {
	return (
		<section className="mb-6">
			<SectionTitle title="LAUNCH TASK" />
			{children}
		</section>
	)
}
