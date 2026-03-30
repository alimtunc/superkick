import type { ReactNode } from 'react'

export function FilterPill({ children }: { children: ReactNode }) {
	return <span className="inline-flex items-center gap-1.5">{children}</span>
}
