import { useEffect, useState } from 'react'

import { ProfileEditor } from '@/components/settings/ProfileEditor'
import { DialogPopup } from '@/components/ui/dialog-shell'
import { ErrorState } from '@/components/ui/state-error'
import { useLaunchProfiles } from '@/hooks/useLaunchProfiles'
import { useSkills } from '@/hooks/useSkills'
import { errorMessageOr } from '@/lib/errors'
import { blankProfile, profilesToClearDefault } from '@/lib/profiles'
import { slugify } from '@/lib/skills'
import type { LaunchProfile } from '@/types'
import { Btn } from '@/ui/Btn'
import { Icon } from '@/ui/Icon'
import { Dialog } from '@base-ui/react/dialog'

interface ProfileEditorDialogProps {
	open: boolean
	profile: LaunchProfile | null
	onClose: () => void
}

export function ProfileEditorDialog({ open, profile, onClose }: ProfileEditorDialogProps) {
	const { profiles, createProfile, updateProfile, isMutating } = useLaunchProfiles()
	const { skills, isLoading: skillsLoading, error: skillsError } = useSkills()
	const [draft, setDraft] = useState<LaunchProfile>(() => profile ?? blankProfile())
	const [submitError, setSubmitError] = useState<string | null>(null)

	const isNew = profile === null

	useEffect(() => {
		if (!open) return
		const base = profile ?? blankProfile()
		setDraft({ ...base, steps: base.steps.map((step) => ({ ...step })) })
		setSubmitError(null)
	}, [open, profile])

	const canSubmit = draft.name.trim().length > 0 && !isMutating

	async function handleSubmit() {
		if (!canSubmit) return
		const id = isNew ? slugify(draft.name) : draft.id
		const payload: LaunchProfile = { ...draft, id, name: draft.name.trim() }
		try {
			if (payload.is_default) {
				await Promise.all(
					profilesToClearDefault(profiles, id).map((other) =>
						updateProfile({ id: other.id, profile: { ...other, is_default: false } })
					)
				)
			}
			if (isNew) {
				await createProfile(payload)
			} else {
				await updateProfile({ id: payload.id, profile: payload })
			}
			onClose()
		} catch (err) {
			setSubmitError(errorMessageOr(err))
		}
	}

	return (
		<Dialog.Root
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose()
			}}
		>
			<DialogPopup popupClassName="dialog" align="top">
				<div className="dialog__head">
					<Icon name="doc" size={18} className="ic" />
					<Dialog.Title className="dialog__title">
						{isNew ? 'New launch profile' : `Edit ${profile.name}`}
					</Dialog.Title>
					<span className="spacer" />
					<Dialog.Close className="iconbtn" aria-label="Close">
						<Icon name="x" size={16} className="ic" />
					</Dialog.Close>
				</div>

				<div className="dialog__body max-h-[70vh] overflow-y-auto">
					{skillsError ? (
						<ErrorState title="Could not load skills" message={skillsError} density="compact" />
					) : null}
					<ProfileEditor
						draft={draft}
						skills={skills}
						skillsLoading={skillsLoading}
						onChange={setDraft}
					/>
					{submitError ? (
						<ErrorState title="Could not save profile" message={submitError} density="compact" />
					) : null}
				</div>

				<div className="dialog__foot">
					<span className="spacer" />
					<Btn kind="ghost" size="sm" onClick={onClose}>
						Cancel
					</Btn>
					<Btn kind="primary" size="sm" disabled={!canSubmit} onClick={handleSubmit}>
						{isMutating ? 'Saving…' : 'Save profile'}
					</Btn>
				</div>
			</DialogPopup>
		</Dialog.Root>
	)
}
