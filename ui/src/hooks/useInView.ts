import { type RefObject, useEffect, useState } from 'react'

/** One-way latch: true once `ref` has entered the viewport, to defer heavy
 *  content. Missing `IntersectionObserver` (SSR/test) counts as in view. */
export function useInView(ref: RefObject<Element | null>, rootMargin = '300px'): boolean {
	const [inView, setInView] = useState(false)

	useEffect(() => {
		if (inView) return
		const el = ref.current
		if (!el) return
		if (typeof IntersectionObserver === 'undefined') {
			setInView(true)
			return
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					setInView(true)
					observer.disconnect()
				}
			},
			{ rootMargin }
		)
		observer.observe(el)
		return () => observer.disconnect()
	}, [ref, inView, rootMargin])

	return inView
}
