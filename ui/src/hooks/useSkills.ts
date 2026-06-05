import { createSkill, deleteSkill, updateSkill } from '@/api'
import { useCrudResource } from '@/hooks/useCrudResource'
import { skillsQuery } from '@/lib/queries'
import { queryKeys } from '@/lib/queryKeys'
import type { SkillDefinition } from '@/types'

export function useSkills() {
	const crud = useCrudResource({
		query: skillsQuery(),
		invalidateKey: queryKeys.skills.all,
		create: createSkill,
		update: updateSkill,
		remove: deleteSkill
	})

	return {
		skills: crud.entities,
		isLoading: crud.isLoading,
		error: crud.error,
		createSkill: crud.createEntity,
		updateSkill: (vars: { id: string; skill: SkillDefinition }) =>
			crud.updateEntity({ id: vars.id, entity: vars.skill }),
		deleteSkill: crud.deleteEntity,
		isMutating: crud.isMutating
	}
}
