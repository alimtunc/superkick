import type { FileDiff } from '@/types'

export interface IndexedFileDiff {
	file: FileDiff
	index: number
}

export function filterIndexedFiles(files: FileDiff[], filter: string): IndexedFileDiff[] {
	const indexedFiles = files.map((file, index) => ({ file, index }))
	const normalizedFilter = filter.trim().toLowerCase()
	if (!normalizedFilter) return indexedFiles
	return indexedFiles.filter(({ file }) =>
		`${file.path} ${file.oldPath ?? ''}`.toLowerCase().includes(normalizedFilter)
	)
}

export function fileSectionId(prefix: string, index: number): string {
	return `${prefix}-${index}`
}

export function scrollToFile(prefix: string, index: number): void {
	document.getElementById(fileSectionId(prefix, index))?.scrollIntoView({ block: 'start' })
}
