export type ShellNavId = 'inbox' | 'board' | 'issues' | 'reviews' | 'agents' | 'skills' | null

export interface ShellTitle {
	active: ShellNavId
	title: string
	crumbs?: string[]
}
