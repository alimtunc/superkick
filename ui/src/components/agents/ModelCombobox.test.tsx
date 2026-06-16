import { useState } from 'react'

import type { ModelInfo } from '@/types'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ModelCombobox } from './ModelCombobox'

const MODELS: ModelInfo[] = [
	{ id: 'claude-opus-4-8', label: 'Claude Opus 4.8', is_default: true },
	{ id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', is_default: false }
]

function Host() {
	const [value, setValue] = useState<string | null>(null)
	return (
		<>
			<ModelCombobox value={value} models={MODELS} onChange={setValue} />
			<output data-testid="value">{value ?? 'null'}</output>
		</>
	)
}

describe('ModelCombobox', () => {
	it('shows the provider-default placeholder when empty', () => {
		render(<ModelCombobox value={null} models={MODELS} onChange={() => {}} />)
		expect(screen.getByLabelText('Model')).toHaveAttribute('placeholder', 'provider default')
	})

	it('reflects the current model id in the input', () => {
		render(<ModelCombobox value="claude-opus-4-8" models={MODELS} onChange={() => {}} />)
		expect(screen.getByLabelText('Model')).toHaveValue('claude-opus-4-8')
	})

	it('accepts a free-text model id not in the suggestion list', async () => {
		const user = userEvent.setup()
		render(<Host />)
		await user.type(screen.getByLabelText('Model'), 'gpt-5-custom')
		expect(screen.getByLabelText('Model')).toHaveValue('gpt-5-custom')
		expect(screen.getByTestId('value')).toHaveTextContent('gpt-5-custom')
	})
})
