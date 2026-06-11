import { useEffect, useRef, useState } from 'react'

import { composeShipBody } from '@/lib/ship'
import { validateHeadBranch } from '@/lib/shipBranch'
import type { LinearStatusChoice, ShipMode } from '@/types'

interface UseShipFormInput {
	open: boolean
	defaultTitle: string
	summary: string
	changedFiles: readonly string[]
	headBranch: string | null
}

export interface ShipFormState {
	mode: ShipMode
	setMode: (mode: ShipMode) => void
	title: string
	setTitle: (title: string) => void
	body: string
	setBody: (body: string) => void
	includeSummary: boolean
	setIncludeSummary: (on: boolean) => void
	includeChangedFiles: boolean
	setIncludeChangedFiles: (on: boolean) => void
	comment: string
	setComment: (comment: string) => void
	statusChoice: LinearStatusChoice
	setStatusChoice: (choice: LinearStatusChoice) => void
	headBranch: string
	setHeadBranch: (name: string) => void
	headBranchError: string | null
	headBranchOverride: string | null
}

export function useShipForm({
	open,
	defaultTitle,
	summary,
	changedFiles,
	headBranch
}: UseShipFormInput): ShipFormState {
	const [mode, setMode] = useState<ShipMode>('draft')
	const [title, setTitle] = useState(defaultTitle ?? '')
	const [headBranchInput, setHeadBranchInput] = useState(headBranch ?? '')
	const [includeSummary, setIncludeSummary] = useState(true)
	const [includeChangedFiles, setIncludeChangedFiles] = useState(true)
	const [comment, setComment] = useState('')
	const [statusChoice, setStatusChoice] = useState<LinearStatusChoice>('no_change')
	const [body, setBodyState] = useState('')
	const [bodyDirty, setBodyDirty] = useState(false)
	const seededRef = useRef(false)

	// Seed once per open session; clear the seed flag on close. Prop changes while
	// open never re-seed, so the operator's in-progress edits survive re-renders.
	useEffect(() => {
		if (!open) {
			seededRef.current = false
			return
		}
		if (seededRef.current) return
		seededRef.current = true
		setMode('draft')
		setTitle(defaultTitle ?? '')
		setHeadBranchInput(headBranch ?? '')
		setIncludeSummary(true)
		setIncludeChangedFiles(true)
		setComment('')
		setStatusChoice('no_change')
		setBodyDirty(false)
		setBodyState(
			composeShipBody({ includeSummary: true, includeChangedFiles: true, summary, changedFiles })
		)
	}, [open, defaultTitle, summary, changedFiles, headBranch])

	// Recompose the body from the include toggles until the operator edits it.
	useEffect(() => {
		if (!open || bodyDirty) return
		setBodyState(composeShipBody({ includeSummary, includeChangedFiles, summary, changedFiles }))
	}, [open, bodyDirty, includeSummary, includeChangedFiles, summary, changedFiles])

	const setBody = (next: string) => {
		setBodyDirty(true)
		setBodyState(next)
	}

	const originalHeadBranch = (headBranch ?? '').trim()
	const trimmedHeadBranch = headBranchInput.trim()
	const headBranchEdited = trimmedHeadBranch !== originalHeadBranch
	const headBranchError = headBranchEdited ? validateHeadBranch(trimmedHeadBranch) : null

	return {
		mode,
		setMode,
		title,
		setTitle,
		body,
		setBody,
		includeSummary,
		setIncludeSummary,
		includeChangedFiles,
		setIncludeChangedFiles,
		comment,
		setComment,
		statusChoice,
		setStatusChoice,
		headBranch: headBranchInput,
		setHeadBranch: setHeadBranchInput,
		headBranchError,
		headBranchOverride: headBranchEdited && headBranchError === null ? trimmedHeadBranch : null
	}
}
