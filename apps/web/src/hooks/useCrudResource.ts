import { toErrorMessage } from '@/lib/errors'
import {
	useMutation,
	useQuery,
	useQueryClient,
	type QueryKey,
	type UseQueryOptions
} from '@tanstack/react-query'

interface CrudResourceConfig<TEntity, TId, TQueryKey extends QueryKey> {
	query: UseQueryOptions<TEntity[], Error, TEntity[], TQueryKey>
	invalidateKey: QueryKey
	create: (entity: TEntity) => Promise<TEntity>
	update: (id: TId, entity: TEntity) => Promise<TEntity>
	remove: (id: TId) => Promise<unknown>
}

interface CrudResource<TEntity, TId> {
	entities: TEntity[]
	isLoading: boolean
	error: string | null
	createEntity: (entity: TEntity) => Promise<TEntity>
	updateEntity: (vars: { id: TId; entity: TEntity }) => Promise<TEntity>
	deleteEntity: (id: TId) => Promise<unknown>
	isMutating: boolean
}

export function useCrudResource<TEntity, TId, TQueryKey extends QueryKey>(
	config: CrudResourceConfig<TEntity, TId, TQueryKey>
): CrudResource<TEntity, TId> {
	const query = useQuery(config.query)
	const queryClient = useQueryClient()
	const invalidate = () => queryClient.invalidateQueries({ queryKey: config.invalidateKey })

	const create = useMutation({ mutationFn: config.create, onSuccess: invalidate })
	const update = useMutation({
		mutationFn: ({ id, entity }: { id: TId; entity: TEntity }) => config.update(id, entity),
		onSuccess: invalidate
	})
	const remove = useMutation({ mutationFn: config.remove, onSuccess: invalidate })

	return {
		entities: query.data ?? [],
		isLoading: query.isLoading,
		error: toErrorMessage(query.error),
		createEntity: create.mutateAsync,
		updateEntity: update.mutateAsync,
		deleteEntity: remove.mutateAsync,
		isMutating: create.isPending || update.isPending || remove.isPending
	}
}
