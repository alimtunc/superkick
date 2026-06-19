import { Icon } from '@/components/primitives'
import type { ExecActivityKind, ExecActivityRow } from '@/types'
import type { SKIconName } from '@/types/icons'

const ROW_ICON: Record<ExecActivityKind, SKIconName> = {
	plan: 'doc',
	search: 'search',
	tool: 'terminal',
	edit: 'doc',
	test: 'check',
	pr: 'pr',
	ask: 'comment',
	stuck: 'alert',
	note: 'clock',
	done: 'check'
}

export function ExecRow({ row }: { row: ExecActivityRow }) {
	return (
		<div className={`execrow${row.active ? ' active' : ''}`}>
			<span className="execrow__icon">
				<Icon name={ROW_ICON[row.kind]} size={15} className="ic" />
			</span>
			<span className="execrow__title">{row.title}</span>
			{row.meta ? <span className="execrow__meta">{row.meta}</span> : null}
		</div>
	)
}
