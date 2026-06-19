import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

export function humanize(value: string): string {
	return value.toLowerCase().replace(/_/g, ' ')
}

export function indexById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
	const map = new Map<string, T>()
	for (const item of items) map.set(item.id, item)
	return map
}
