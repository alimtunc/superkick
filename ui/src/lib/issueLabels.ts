import type { IssueLabel } from '@/types'

export const DEFAULT_LABEL_COLOR = '#6b7280'

export function buildLabelColorMap(issues: { labels: IssueLabel[] }[]): Map<string, string> {
	const map = new Map<string, string>()
	for (const issue of issues) {
		for (const label of issue.labels) {
			if (!map.has(label.name)) {
				map.set(label.name, label.color)
			}
		}
	}
	return map
}
