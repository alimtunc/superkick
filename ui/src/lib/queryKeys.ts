export const queryKeys = {
	issues: {
		all: ['issues'] as const,
		list: (limit: number) => ['issues', limit] as const
	},
	runs: {
		all: ['runs'] as const,
		detail: (id: string) => ['runs', id] as const
	}
}
