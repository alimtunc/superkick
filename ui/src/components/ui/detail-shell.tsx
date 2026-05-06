import type { ReactNode } from 'react'

export function DetailShell({ children }: { children: ReactNode }) {
	return <div className="mx-auto max-w-7xl px-5 py-6">{children}</div>
}
