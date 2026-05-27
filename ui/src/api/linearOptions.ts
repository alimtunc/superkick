import type { LinearOptions } from '@/types'

import { BASE, throwLinearError } from './_shared'

export async function fetchLinearOptions(): Promise<LinearOptions> {
	const res = await fetch(`${BASE}/linear/options`)
	if (!res.ok) await throwLinearError(res, 'GET /linear/options failed')
	return res.json()
}
