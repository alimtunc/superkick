import { useEffect, useMemo, useState } from 'react'

import { DialogShell } from '@/components/composites/dialog-shell'
import { Icon, PriorityIcon, Btn, Textarea } from '@/components/primitives'
import { AuthorAvatar } from '@/domains/issues/components/issue-detail/AuthorAvatar'
import { LabelChip } from '@/domains/issues/components/issue-detail/LabelChip'
import { StatusChip } from '@/domains/issues/components/issue-detail/StatusChip'
import { AssigneePicker } from '@/domains/issues/components/pickers/AssigneePicker'
import { DueDatePicker } from '@/domains/issues/components/pickers/DueDatePicker'
import { EstimateInput } from '@/domains/issues/components/pickers/EstimateInput'
import { LabelsPicker } from '@/domains/issues/components/pickers/LabelsPicker'
import { PriorityPicker } from '@/domains/issues/components/pickers/PriorityPicker'
import { ProjectPicker } from '@/domains/issues/components/pickers/ProjectPicker'
import { StatusPicker } from '@/domains/issues/components/pickers/StatusPicker'
import { TeamPicker } from '@/domains/issues/components/pickers/TeamPicker'
import { useCreateIssue } from '@/hooks/useCreateIssue'
import { useLinearOptions } from '@/hooks/useLinearOptions'
import { priorityIconKindFromValue } from '@/lib/domain'
import { PRIORITY_META } from '@/lib/domain/priorityMeta'
import { formatShortDate } from '@/lib/format'
import type {
	IssueCreateRequest,
	LabelOption,
	ProjectOption,
	TeamOption,
	UserOption,
	WorkflowStateOption
} from '@/types'
import { Popover } from '@base-ui/react/popover'
import { useNavigate } from '@tanstack/react-router'

interface NewIssueDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	defaultTeamId: string | null
}

const FIELD_TRIGGER =
	'inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-canvas px-2 text-[12px] text-fg transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none data-[popup-open]:border-border-strong'

interface FieldPopoverProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	ariaLabel: string
	trigger: React.ReactNode
	children: React.ReactNode
}

function FieldPopover({ open, onOpenChange, ariaLabel, trigger, children }: FieldPopoverProps) {
	return (
		<Popover.Root open={open} onOpenChange={onOpenChange}>
			<Popover.Trigger className={FIELD_TRIGGER} aria-label={ariaLabel}>
				{trigger}
			</Popover.Trigger>
			{children}
		</Popover.Root>
	)
}

interface DraftState {
	title: string
	description: string
	teamId: string | null
	stateId: string | null
	assignee: UserOption | null
	priority: number | null
	labelIds: string[]
	project: ProjectOption | null
	dueDate: string | null
	estimate: number | null
}

const INITIAL_DRAFT: DraftState = {
	title: '',
	description: '',
	teamId: null,
	stateId: null,
	assignee: null,
	priority: null,
	labelIds: [],
	project: null,
	dueDate: null,
	estimate: null
}

export function NewIssueDialog({ open, onOpenChange, defaultTeamId }: NewIssueDialogProps) {
	const navigate = useNavigate()
	const { data: options } = useLinearOptions()
	const mutation = useCreateIssue()

	const [draft, setDraft] = useState<DraftState>(INITIAL_DRAFT)
	const [activePicker, setActivePicker] = useState<string | null>(null)

	useEffect(() => {
		if (!open || !options) return
		setDraft((prev) => {
			if (prev.teamId) return prev
			const fallbackTeam =
				options.teams.find((team) => team.id === defaultTeamId) ??
				options.teams.toSorted((a, b) => a.name.localeCompare(b.name))[0] ??
				null
			return fallbackTeam ? { ...prev, teamId: fallbackTeam.id } : prev
		})
	}, [open, options, defaultTeamId])

	const resetCreate = mutation.reset
	useEffect(() => {
		if (open) return
		setDraft(INITIAL_DRAFT)
		setActivePicker(null)
		resetCreate()
	}, [open, resetCreate])

	const team: TeamOption | null = useMemo(
		() => options?.teams.find((t) => t.id === draft.teamId) ?? null,
		[options, draft.teamId]
	)

	const states: WorkflowStateOption[] = useMemo(() => {
		if (!options || !draft.teamId) return []
		return options.workflow_states_by_team[draft.teamId] ?? []
	}, [options, draft.teamId])

	const visibleLabels: LabelOption[] = useMemo(() => {
		if (!options) return []
		return options.labels.filter((label) => label.team_id === null || label.team_id === draft.teamId)
	}, [options, draft.teamId])

	const currentState = useMemo(
		() => states.find((state) => state.id === draft.stateId) ?? null,
		[states, draft.stateId]
	)
	const selectedLabels = useMemo(
		() => visibleLabels.filter((label) => draft.labelIds.includes(label.id)),
		[visibleLabels, draft.labelIds]
	)

	const canSubmit = draft.title.trim().length > 0 && draft.teamId !== null && !mutation.isPending

	const submit = () => {
		if (!canSubmit || !draft.teamId) return
		const body: IssueCreateRequest = {
			team_id: draft.teamId,
			title: draft.title.trim()
		}
		if (draft.description.trim().length > 0) body.description = draft.description
		if (draft.stateId !== null) body.state_id = draft.stateId
		if (draft.assignee !== null) body.assignee_id = draft.assignee.id
		if (draft.priority !== null) body.priority = draft.priority
		if (draft.labelIds.length > 0) body.label_ids = draft.labelIds
		if (draft.project !== null) body.project_id = draft.project.id
		if (draft.dueDate !== null) body.due_date = draft.dueDate
		if (draft.estimate !== null) body.estimate = draft.estimate

		mutation.mutate(body, {
			onSuccess: (response) => {
				onOpenChange(false)
				void navigate({ to: '/issues/$issueId', params: { issueId: response.identifier } })
			}
		})
	}

	const priorityMeta = draft.priority !== null ? PRIORITY_META[draft.priority] : null

	return (
		<DialogShell
			open={open}
			onOpenChange={(next) => {
				if (!next) onOpenChange(false)
			}}
			popupClassName="dialog on-raised"
			align="top"
			title="New issue"
			footer={
				<>
					<span className="spacer" />
					<Btn kind="ghost" size="sm" onClick={() => onOpenChange(false)}>
						Cancel
					</Btn>
					<Btn kind="primary" size="sm" disabled={!canSubmit} onClick={submit}>
						{mutation.isPending ? 'Creating…' : 'Create issue'}
					</Btn>
				</>
			}
		>
			<div className="dialog__body">
				<input
					type="text"
					value={draft.title}
					onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
					placeholder="Issue title"
					autoFocus
					className="input text-[14px] font-semibold"
					aria-label="Issue title"
				/>

				<Textarea
					value={draft.description}
					onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
					rows={6}
					placeholder="Add description…"
					className="resize-y leading-relaxed"
					aria-label="Description"
				/>

				<div className="flex flex-wrap gap-1.5">
					<FieldPopover
						open={activePicker === 'team'}
						onOpenChange={(next) => setActivePicker(next ? 'team' : null)}
						ariaLabel="Change team"
						trigger={
							<>
								<Icon name="branch" size={11} className="text-fg-dim" />
								<span>{team ? `${team.key} · ${team.name}` : 'Select team'}</span>
							</>
						}
					>
						<TeamPicker
							teams={options?.teams ?? []}
							currentId={draft.teamId}
							onSelect={(next) => {
								setActivePicker(null)
								setDraft((prev) => ({
									...prev,
									teamId: next.id,
									stateId: null,
									labelIds: []
								}))
							}}
						/>
					</FieldPopover>

					<FieldPopover
						open={activePicker === 'status'}
						onOpenChange={(next) => setActivePicker(next ? 'status' : null)}
						ariaLabel="Change status"
						trigger={
							currentState ? (
								<StatusChip
									status={{
										state_type: currentState.state_type,
										name: currentState.name,
										color: currentState.color
									}}
								/>
							) : (
								<>
									<Icon name="flag" size={11} className="text-fg-dim" />
									<span>Status</span>
								</>
							)
						}
					>
						<StatusPicker
							states={states}
							currentId={draft.stateId}
							onSelect={(next) => {
								setActivePicker(null)
								setDraft((prev) => ({ ...prev, stateId: next.id }))
							}}
						/>
					</FieldPopover>

					<FieldPopover
						open={activePicker === 'assignee'}
						onOpenChange={(next) => setActivePicker(next ? 'assignee' : null)}
						ariaLabel="Change assignee"
						trigger={
							draft.assignee ? (
								<>
									<AuthorAvatar
										name={draft.assignee.name}
										avatarUrl={draft.assignee.avatar_url}
									/>
									<span>{draft.assignee.name}</span>
								</>
							) : (
								<>
									<Icon name="user" size={11} className="text-fg-dim" />
									<span>Assignee</span>
								</>
							)
						}
					>
						<AssigneePicker
							users={options?.users ?? []}
							currentId={draft.assignee?.id ?? null}
							onSelect={(next) => {
								setActivePicker(null)
								setDraft((prev) => ({ ...prev, assignee: next }))
							}}
						/>
					</FieldPopover>

					<FieldPopover
						open={activePicker === 'priority'}
						onOpenChange={(next) => setActivePicker(next ? 'priority' : null)}
						ariaLabel="Change priority"
						trigger={
							priorityMeta ? (
								<>
									<PriorityIcon
										kind={priorityIconKindFromValue(draft.priority ?? 0)}
										size={12}
									/>
									<span>{priorityMeta.label}</span>
								</>
							) : (
								<>
									<PriorityIcon kind="none" size={12} />
									<span>Priority</span>
								</>
							)
						}
					>
						<PriorityPicker
							currentValue={draft.priority ?? 0}
							onSelect={(next) => {
								setActivePicker(null)
								setDraft((prev) => ({ ...prev, priority: next }))
							}}
						/>
					</FieldPopover>

					<FieldPopover
						open={activePicker === 'labels'}
						onOpenChange={(next) => setActivePicker(next ? 'labels' : null)}
						ariaLabel="Change labels"
						trigger={
							selectedLabels.length > 0 ? (
								<span className="flex flex-wrap gap-1">
									{selectedLabels.map((label) => (
										<LabelChip
											key={label.id}
											label={{ name: label.name, color: label.color }}
										/>
									))}
								</span>
							) : (
								<>
									<Icon name="pin" size={11} className="text-fg-dim" />
									<span>Labels</span>
								</>
							)
						}
					>
						<LabelsPicker
							labels={visibleLabels}
							selectedIds={draft.labelIds}
							onApply={(nextIds) => {
								setActivePicker(null)
								setDraft((prev) => ({ ...prev, labelIds: nextIds }))
							}}
						/>
					</FieldPopover>

					<FieldPopover
						open={activePicker === 'project'}
						onOpenChange={(next) => setActivePicker(next ? 'project' : null)}
						ariaLabel="Change project"
						trigger={
							draft.project ? (
								<>
									<Icon name="folder" size={11} className="text-fg-dim" />
									<span>{draft.project.name}</span>
								</>
							) : (
								<>
									<Icon name="folder" size={11} className="text-fg-dim" />
									<span>Project</span>
								</>
							)
						}
					>
						<ProjectPicker
							projects={options?.projects ?? []}
							currentId={draft.project?.id ?? null}
							onSelect={(next) => {
								setActivePicker(null)
								setDraft((prev) => ({ ...prev, project: next }))
							}}
						/>
					</FieldPopover>

					<FieldPopover
						open={activePicker === 'dueDate'}
						onOpenChange={(next) => setActivePicker(next ? 'dueDate' : null)}
						ariaLabel="Change due date"
						trigger={
							draft.dueDate ? (
								<>
									<Icon name="clock" size={11} className="text-fg-dim" />
									<span>{formatShortDate(draft.dueDate)}</span>
								</>
							) : (
								<>
									<Icon name="clock" size={11} className="text-fg-dim" />
									<span>Due date</span>
								</>
							)
						}
					>
						<DueDatePicker
							current={draft.dueDate}
							onApply={(next) => {
								setActivePicker(null)
								setDraft((prev) => ({ ...prev, dueDate: next }))
							}}
						/>
					</FieldPopover>

					<FieldPopover
						open={activePicker === 'estimate'}
						onOpenChange={(next) => setActivePicker(next ? 'estimate' : null)}
						ariaLabel="Change estimate"
						trigger={
							<>
								<Icon name="spark" size={11} className="text-fg-dim" />
								<span>{draft.estimate !== null ? `${draft.estimate} pts` : 'Estimate'}</span>
							</>
						}
					>
						<EstimateInput
							current={draft.estimate}
							onApply={(next) => {
								setActivePicker(null)
								setDraft((prev) => ({ ...prev, estimate: next }))
							}}
						/>
					</FieldPopover>
				</div>
			</div>
		</DialogShell>
	)
}
