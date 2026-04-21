export const queryKeys = {
	issues: {
		all: ['issues'] as const,
		list: (limit: number) => ['issues', limit] as const,
		detail: (id: string) => ['issues', 'detail', id] as const
	},
	runs: {
		all: ['runs'] as const,
		detail: (id: string) => ['runs', id] as const
	},
	dashboard: {
		all: ['dashboard'] as const,
		queue: ['dashboard', 'queue'] as const
	}
}
