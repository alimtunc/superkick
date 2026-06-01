import { useEffect, useState } from 'react'

const STORAGE_KEY = 'superkick.search.showDoneInScoped'

export function useScopedDonePref(): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
	const [value, setValue] = useState<boolean>(() => {
		if (typeof window === 'undefined') return false
		return window.localStorage.getItem(STORAGE_KEY) === 'true'
	})
	useEffect(() => {
		if (typeof window === 'undefined') return
		window.localStorage.setItem(STORAGE_KEY, String(value))
	}, [value])
	return [value, setValue]
}
