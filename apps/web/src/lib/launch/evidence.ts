import { resolveProviderLabel } from '@/lib/domain'
import type { EvidenceKind, LaunchTaskStep } from '@/types'
import type { SKIconName, SKTone } from '@/types/icons'

export const EVIDENCE_KIND_ICON: Record<EvidenceKind, SKIconName> = {
	tool: 'terminal',
	edit: 'doc',
	test: 'check',
	search: 'search',
	ask: 'comment',
	stuck: 'alert',
	note: 'doc'
}

export const EVIDENCE_KIND_TONE: Record<EvidenceKind, SKTone> = {
	tool: 'info',
	edit: 'accent',
	test: 'success',
	search: 'neutral',
	ask: 'warn',
	stuck: 'danger',
	note: 'neutral'
}

export const EVIDENCE_ACCENT_BORDER: Record<SKTone, string> = {
	neutral: 'border-l-fg-dim',
	accent: 'border-l-accent',
	success: 'border-l-success',
	warn: 'border-l-warn',
	danger: 'border-l-danger',
	info: 'border-l-info'
}

export const EVIDENCE_ACCENT_TEXT: Record<SKTone, string> = {
	neutral: 'text-fg-dim',
	accent: 'text-accent',
	success: 'text-success',
	warn: 'text-warn',
	danger: 'text-danger',
	info: 'text-info'
}

export function evidenceKindForStep(step: LaunchTaskStep): EvidenceKind {
	if (step.status === 'failed') return 'stuck'
	if (step.status === 'needs_human') return 'ask'
	switch (step.step_kind) {
		case 'plan':
			return 'search'
		case 'implement':
			return 'edit'
		case 'review':
			return 'test'
	}
}

export function evidenceMetaForStep(step: LaunchTaskStep): string {
	const provider = step.provider ? resolveProviderLabel(step.provider) : null
	const resumed = step.auto_resume_count > 0 ? `resumed ${step.auto_resume_count}×` : null
	const parts = [provider, step.model, resumed].filter((p): p is string => Boolean(p))
	return parts.join(' · ')
}
