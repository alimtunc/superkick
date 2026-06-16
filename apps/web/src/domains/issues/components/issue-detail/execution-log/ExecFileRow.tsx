import { splitPath } from '@/lib/path'
import type { ExecFileChange } from '@/types'

export function ExecFileRow({ file }: { file: ExecFileChange }) {
	const { dir, name } = splitPath(file.path)
	const hasCounts = file.adds !== null && file.dels !== null

	return (
		<div className="filerow">
			<span className="filerow__path" style={file.active ? { color: 'var(--accent)' } : undefined}>
				<span className="dir">{dir}</span>
				{name}
			</span>
			{hasCounts ? (
				<span className="filerow__stat">
					<span className="add">+{file.adds}</span>
					<span className="del">−{file.dels}</span>
				</span>
			) : null}
		</div>
	)
}
