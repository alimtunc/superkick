import { SideDrawer } from '@/components/composites/side-drawer'
import { RunDrawerContent } from '@/domains/issues/components/issue-detail/run-drawer/RunDrawerContent'
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
			width="half"
			resizable
			bare
		>
			{runId ? <RunDrawerContent runId={runId} /> : null}
		</SideDrawer>
	)
}
