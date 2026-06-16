import type { LaunchStepKind } from '@/types'

/** A step's recommended agent role, inferred from its skill ref. Anything that
 *  isn't `plan`/`review` is treated as an `implement` step. */
export function stepKindFromSkillRef(skillRef: string): LaunchStepKind {
	return skillRef === 'plan' || skillRef === 'review' ? skillRef : 'implement'
}
