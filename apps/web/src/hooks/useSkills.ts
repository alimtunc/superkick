import { createSkill, deleteSkill, importSkills, updateSkill } from '@/api'
import { useCrudResource } from '@/hooks/useCrudResource'
import { toErrorMessage } from '@/lib/errors'
import { importableSkillsQuery, skillsQuery } from '@/lib/queries'
import { queryKeys } from '@/lib/queryKeys'
import type { SkillDefinition, SkillImportCandidate } from '@/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

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

export function useImportableSkills(enabled: boolean) {
	const queryClient = useQueryClient()
	const query = useQuery(importableSkillsQuery(enabled))
	const importMutation = useMutation({
		mutationFn: importSkills,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.skills.all })
	})

	return {
		candidates: query.data ?? [],
		isLoading: query.isLoading,
		error: toErrorMessage(query.error),
		importSkills: (candidates: SkillImportCandidate[]) => importMutation.mutateAsync(candidates),
		isImporting: importMutation.isPending
	}
}
