import { useCleanIssue } from '@/hooks/useCleanIssue'
import type { CleanIssueResponse } from '@/types/cleanIssue'
import { toast } from 'sonner'

function cleanSummary(result: CleanIssueResponse): string {
	const runs = `${result.runs} run${result.runs === 1 ? '' : 's'}`
	const tasks = `${result.launch_tasks} task${result.launch_tasks === 1 ? '' : 's'}`
	return `${runs}, ${tasks}`
}

interface UseIssueCleanActionsOptions {
	issueIdentifier: string
	issueId: string
	onPurged?: () => void
}

export function useIssueCleanActions({ issueIdentifier, issueId, onPurged }: UseIssueCleanActionsOptions) {
	const cleanIssue = useCleanIssue({
		issueIdentifier,
		issueId,
		onSuccess: (result) => {
			const summary = cleanSummary(result)
			if (result.mode === 'archive') {
				toast.success(`Archived ${summary} on ${issueIdentifier}`)
			} else {
				toast.success(`Purged ${summary} on ${issueIdentifier}`)
				onPurged?.()
			}
		}
	})

	const archive = () => {
		cleanIssue.mutate('archive', {
			onError: (err) => toast.error('Clean failed', { description: err.message })
		})
	}

	const purge = () => {
		cleanIssue.mutate('purge', {
			onError: (err) => toast.error('Purge failed', { description: err.message })
		})
	}

	return {
		archive,
		purge,
		archivePending: cleanIssue.isPending && cleanIssue.variables === 'archive',
		purgePending: cleanIssue.isPending && cleanIssue.variables === 'purge'
	}
}
