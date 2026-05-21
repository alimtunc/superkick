import { searchQuery } from '@/lib/queries'
import type { SearchScope } from '@/types'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { useDebouncedValue } from './useDebouncedValue'

interface UseCommandSearchOptions {
	query: string
	scope: SearchScope
	includeDone: boolean
	enabled: boolean
}

export function useCommandSearch({ query, scope, includeDone, enabled }: UseCommandSearchOptions) {
	const debounced = useDebouncedValue(query, 150)
	return useQuery({
		...searchQuery({ q: debounced, scope, includeDone }),
		enabled: enabled && (scope !== 'all' || debounced.length > 0),
		placeholderData: keepPreviousData
	})
}
