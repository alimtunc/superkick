import { Fragment, type ReactNode } from 'react'

export function joinWithAnd(parts: ReactNode[]): ReactNode {
	if (parts.length === 0) return null
	if (parts.length === 1) return parts[0]
	if (parts.length === 2) {
		return (
			<>
				{parts[0]} and {parts[1]}
			</>
		)
	}
	const head = parts.slice(0, -1)
	const tail = parts[parts.length - 1]
	return (
		<>
			{head.map((part, i) => (
				<Fragment key={i}>
					{part}
					{', '}
				</Fragment>
			))}
			and {tail}
		</>
	)
}
