import { COMBOBOX_POPUP_CLASS } from '@/components/ui/combobox-shell'
import { describe, expect, it } from 'vitest'

describe('combobox shell popup class', () => {
	it('carries the shared surface, border, and elevation tokens', () => {
		expect(COMBOBOX_POPUP_CLASS).toContain('rounded-[7px]')
		expect(COMBOBOX_POPUP_CLASS).toContain('border-border')
		expect(COMBOBOX_POPUP_CLASS).toContain('bg-surface')
		expect(COMBOBOX_POPUP_CLASS).toContain('shadow-lg')
	})

	it('leaves width, gap, and padding to the call site', () => {
		expect(COMBOBOX_POPUP_CLASS).not.toMatch(/\bw-\d/)
		expect(COMBOBOX_POPUP_CLASS).not.toMatch(/\bgap-/)
		expect(COMBOBOX_POPUP_CLASS).not.toMatch(/\bp-\d/)
	})
})
