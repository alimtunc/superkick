import { MENU_ITEM_CLASS, MENU_POPUP_CLASS } from '@/components/composites/menu-shell'
import { describe, expect, it } from 'vitest'

describe('menu shell interaction classes', () => {
	it('gives menu items fast Linear-style hover and keyboard-highlight feedback', () => {
		expect(MENU_ITEM_CLASS).toContain('transition-[background,color,transform]')
		expect(MENU_ITEM_CLASS).toContain('data-highlighted:bg-(--bg-active)')
		expect(MENU_ITEM_CLASS).toContain('data-highlighted:translate-x-0.5')
	})

	it('animates popups in and out without changing layout', () => {
		expect(MENU_POPUP_CLASS).toContain('transition-[opacity,transform]')
		expect(MENU_POPUP_CLASS).toContain('data-[starting-style]:scale-98')
		expect(MENU_POPUP_CLASS).toContain('data-[ending-style]:opacity-0')
	})
})
