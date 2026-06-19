import { useIssueKeyboard } from '@/hooks/useIssueKeyboard'

interface IssueKeyboardProps {
	identifiers: readonly string[]
	focusedIdentifier: string | null
	onFocus: (identifier: string | null) => void
	onOpenFilter: () => void
}

export function IssueKeyboard({ identifiers, focusedIdentifier, onFocus, onOpenFilter }: IssueKeyboardProps) {
	useIssueKeyboard({ identifiers, focusedIdentifier, onFocus, onOpenFilter })
	return null
}
