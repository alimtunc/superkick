import { describe, expect, it } from 'vitest'

import { sanitizeGithubMarkdown } from './markdown'

describe('sanitizeGithubMarkdown', () => {
	it('drops HTML comment wrappers bots emit', () => {
		const out = sanitizeGithubMarkdown('<!-- copilot:tracking 123 -->\nReview complete. Not **LGTM**.')
		expect(out).toBe('Review complete. Not **LGTM**.')
		expect(out).not.toContain('<!--')
	})

	it('unwraps <details> and removes the <summary> toggle label', () => {
		const out = sanitizeGithubMarkdown(
			'<details><summary>Show a summary per file</summary>plain note here</details>'
		)
		expect(out).toBe('plain note here')
		expect(out).not.toContain('summary')
		expect(out).not.toContain('<details>')
	})

	it('keeps markdown syntax intact while stripping HTML tags', () => {
		const out = sanitizeGithubMarkdown(
			'<div class="x"><p>Hello <strong>there</strong></p></div>\n\n- one\n- two'
		)
		expect(out).toContain('Hello')
		expect(out).toContain('- one')
		expect(out).not.toContain('<div')
		expect(out).not.toContain('<p>')
	})

	it('converts <br> to newlines and decodes common entities', () => {
		const out = sanitizeGithubMarkdown('line a<br>line b &amp; &lt;tag&gt;')
		expect(out).toBe('line a\nline b & <tag>')
	})

	it('preserves autolinks as plain text', () => {
		expect(sanitizeGithubMarkdown('see <https://example.com/x> now')).toBe(
			'see https://example.com/x now'
		)
	})

	it('drops the mailto: scheme from autolinked addresses', () => {
		expect(sanitizeGithubMarkdown('ping <mailto:a@b.com> please')).toBe('ping a@b.com please')
	})

	it('leaves HTML samples inside fenced code blocks byte-for-byte intact', () => {
		const fenced = '```html\n<div class="x">\n  <p>hi</p>\n</div>\n```'
		expect(sanitizeGithubMarkdown(fenced)).toBe(fenced)
	})

	it('leaves HTML inside inline code intact', () => {
		expect(sanitizeGithubMarkdown('use `<div>` here')).toBe('use `<div>` here')
	})

	it('strips a bot wrapper around a code sample without touching the sample', () => {
		const input = '<!-- bot -->\nUse `<details>` sparingly:\n```html\n<details></details>\n```'
		expect(sanitizeGithubMarkdown(input)).toBe(
			'Use `<details>` sparingly:\n```html\n<details></details>\n```'
		)
	})

	it('collapses the blank-line craters left by removed blocks', () => {
		expect(sanitizeGithubMarkdown('a\n\n\n\n\nb')).toBe('a\n\nb')
	})
})
