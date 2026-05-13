import { useEffect, useState } from 'react'

interface ClientDateTimeProps {
	value: string | null | undefined
	format?: 'date-time' | 'time'
	fallback?: string
}

export function ClientDateTime({ value, format = 'date-time', fallback = '' }: ClientDateTimeProps) {
	const [label, setLabel] = useState(fallback)

	useEffect(() => {
		if (!value) {
			setLabel(fallback)
			return
		}

		const date = new Date(value)
		setLabel(format === 'time' ? date.toLocaleTimeString() : date.toLocaleString())
	}, [fallback, format, value])

	if (!value) return <>{fallback}</>
	return <time dateTime={value}>{label}</time>
}
