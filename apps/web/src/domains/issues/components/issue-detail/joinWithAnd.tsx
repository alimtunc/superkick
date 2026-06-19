import { Fragment, isValidElement, type Key, type ReactNode } from 'react'

function partKey(part: ReactNode, fallback: number): Key {
	if (isValidElement(part) && part.key !== null) return part.key
	return fallback
}

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
				<Fragment key={partKey(part, i)}>
					{part}
					{', '}
				</Fragment>
			))}
			and {tail}
		</>
	)
}
