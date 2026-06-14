export type ShellNavId = 'inbox' | 'board' | 'issues' | null

export interface ShellTitle {
	active: ShellNavId
	title: string
	crumbs?: string[]
}
