import type { FileDiff } from '@/types'

export const multiFileDiffSmokeFiles: FileDiff[] = [
	{
		path: 'ui/src/components/run-detail/RunWorkspaceTabs/ChangesTab.test.tsx',
		status: 'modified',
		additions: 9,
		deletions: 3,
		binary: false,
		truncated: false,
		patch: '@@ -98,7 +98,10 @@\n-\texpect(screen.getByText("+5")).toBeInTheDocument()\n+\texpect(screen.getByText("+9")).toBeInTheDocument()\n+\texpect(screen.getByRole("button", { name: /ChangesTab\\.fixture\\.ts/ })).toBeInTheDocument()'
	},
	{
		path: 'ui/src/components/run-detail/RunWorkspaceTabs/ChangesTab.fixture.ts',
		status: 'added',
		additions: 21,
		deletions: 0,
		binary: false,
		truncated: false,
		patch: '@@ -0,0 +1,5 @@\n+import type { FileDiff } from "@/types"\n+\n+export const multiFileDiffSmokeFiles: FileDiff[] = [\n+\t// deterministic local diff viewer smoke data\n+]'
	},
	{
		path: 'docs/diff-viewer-smoke.md',
		status: 'deleted',
		additions: 0,
		deletions: 4,
		binary: false,
		truncated: false,
		patch: '@@ -1,4 +0,0 @@\n-Diff viewer smoke fixture\n-Old assertion copy\n-Temporary docs entry\n-End of fixture'
	}
]
