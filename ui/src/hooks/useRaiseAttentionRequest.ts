import { useState } from 'react'

import { createAttentionRequest } from '@/api'
import type { AttentionKind } from '@/types'
import { useForm, type AnyFormApi } from '@tanstack/react-form'

interface RaiseFormValues {
	kind: AttentionKind
	title: string
	body: string
	optionsText: string
}

const defaultValues: RaiseFormValues = {
	kind: 'clarification',
	title: '',
	body: '',
	optionsText: ''
}

export function useRaiseAttentionRequest(runId: string, onCreated: () => void) {
	const [open, setOpen] = useState(false)

	const onSubmit = async ({ value, formApi }: { value: RaiseFormValues; formApi: AnyFormApi }) => {
		const options =
			value.kind === 'decision'
				? value.optionsText
						.split(',')
						.map((s) => s.trim())
						.filter(Boolean)
				: undefined
		try {
			await createAttentionRequest(runId, {
				kind: value.kind,
				title: value.title.trim(),
				body: value.body.trim(),
				options
			})
			formApi.reset()
			setOpen(false)
			onCreated()
		} catch (e) {
			formApi.setErrorMap({ onSubmit: { form: String(e), fields: {} } })
		}
	}

	const form = useForm({ defaultValues, onSubmit })

	const close = () => {
		form.reset()
		setOpen(false)
	}

	return { form, open, setOpen, close }
}
