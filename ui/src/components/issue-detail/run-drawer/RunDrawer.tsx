import { RunDrawerContent } from '@/components/issue-detail/run-drawer/RunDrawerContent'
import { SideDrawer } from '@/components/ui/side-drawer'
import { useRunDrawerStore } from '@/stores/runDrawer'

export function RunDrawer() {
	const open = useRunDrawerStore((s) => s.open)
	const runId = useRunDrawerStore((s) => s.runId)
	const closeDrawer = useRunDrawerStore((s) => s.closeDrawer)

	return (
		<SideDrawer
			open={open}
			onClose={closeDrawer}
			title="Run"
			closeAriaLabel="Close run drawer"
			width="two-thirds"
		>
			<div className="min-h-0 flex-1">{runId ? <RunDrawerContent runId={runId} /> : null}</div>
		</SideDrawer>
	)
}
