import type { LaunchTaskStep } from '@/types'

export function uniqueChangedFiles(steps: readonly LaunchTaskStep[]): string[] {
	return [...new Set(steps.flatMap((step) => step.structured_result?.changed_files ?? []))]
}
