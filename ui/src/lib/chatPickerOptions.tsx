import type { ReactNode } from 'react'

import type { AgentProvider, ChatPermissionMode } from '@/types'
import { ClipboardList, CodeXml, Hand, Sparkles } from 'lucide-react'

export interface ModelOption {
	value: string | null
	label: string
}

const CLAUDE_MODELS: ModelOption[] = [
	{ value: null, label: 'Default' },
	{ value: 'claude-opus-4-7', label: 'Opus 4.7' },
	{ value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
	{ value: 'claude-haiku-4-5', label: 'Haiku 4.5' }
]

const CODEX_MODELS: ModelOption[] = [
	{ value: null, label: 'Default' },
	{ value: 'gpt-5', label: 'GPT-5' },
	{ value: 'gpt-5-mini', label: 'GPT-5 mini' }
]

export function modelOptionsFor(provider: AgentProvider): ModelOption[] {
	return provider === 'claude' ? CLAUDE_MODELS : CODEX_MODELS
}

export interface ModeOption {
	value: ChatPermissionMode
	label: string
	description: string
	icon: ReactNode
}

export const DEFAULT_MODE_OPTIONS: ModeOption[] = [
	{
		value: 'ask_before_edits',
		label: 'Ask before edits',
		description: 'Agent will ask for approval before making each edit.',
		icon: <Hand size={14} strokeWidth={1.75} />
	},
	{
		value: 'edit_automatically',
		label: 'Edit automatically',
		description: 'Agent will edit your selected text or the whole file.',
		icon: <CodeXml size={14} strokeWidth={1.75} />
	},
	{
		value: 'plan_mode',
		label: 'Plan mode',
		description: 'Agent will explore the code and present a plan before editing.',
		icon: <ClipboardList size={14} strokeWidth={1.75} />
	},
	{
		value: 'auto_mode',
		label: 'Auto mode',
		description: 'Agent will automatically choose the best permission mode for each task.',
		icon: <Sparkles size={14} strokeWidth={1.75} />
	}
]
