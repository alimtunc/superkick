import { readAutoTransitionInProgress } from '@/components/settings/readAutoTransition'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'
import { useAutoTransitionToggle } from '@/hooks/useAutoTransitionToggle'
import { useConfig } from '@/hooks/useConfig'
import { THEME_OPTIONS } from '@/lib/themeOptions'
import { useThemeStore } from '@/stores/theme'
import { Toggle } from '@/ui/Toggle'

export function SettingsPaneGeneral() {
	const mode = useThemeStore((s) => s.mode)
	const setMode = useThemeStore((s) => s.setMode)
	const { config } = useConfig()
	const autoTransition = readAutoTransitionInProgress(config)
	const autoTransitionMutation = useAutoTransitionToggle()

	return (
		<section>
			<h2 className="mb-7 text-[21px] font-semibold tracking-tight text-fg">Settings</h2>

			<SettingsSection title="Daemon">
				<SettingsRow label="Status" hint="superkickd · port 7878">
					<Pill tone="success" leading={<span className="agdot agdot--shipped" />}>
						running
					</Pill>
				</SettingsRow>
				<SettingsRow label="Auto-start on login" last>
					<Toggle checked disabled ariaLabel="Auto-start on login" />
				</SettingsRow>
			</SettingsSection>

			<SettingsSection title="Linear">
				<SettingsRow label="Workspace" hint="Connected · superkick.linear.app">
					<Button variant="outline" size="sm">
						Re-sync
					</Button>
				</SettingsRow>
				<SettingsRow
					label="Move issue to In Progress on launch"
					hint="Auto-transition the Linear issue when you launch a task"
					last
				>
					<Toggle
						checked={autoTransition}
						disabled={autoTransitionMutation.isPending}
						onChange={(next) => autoTransitionMutation.mutate(next)}
						ariaLabel="Move issue to In Progress on launch"
					/>
				</SettingsRow>
			</SettingsSection>

			<SettingsSection title="Default launch profile">
				<SettingsRow label="Run in worktree" hint="Isolate each run under ~/.superkick/wt">
					<Toggle checked disabled ariaLabel="Run in worktree" />
				</SettingsRow>
				<SettingsRow label="Live mode" hint="Stream tool calls as they happen">
					<Toggle checked disabled ariaLabel="Live mode" />
				</SettingsRow>
				<SettingsRow label="Default skills" last>
					<div className="flex gap-1.5">
						<Pill tone="neutral">ticket</Pill>
						<Pill tone="neutral">review</Pill>
						<Pill tone="neutral">ship</Pill>
					</div>
				</SettingsRow>
			</SettingsSection>

			<SettingsSection title="Appearance">
				<SettingsRow label="Theme" hint="Live preview — flips the whole app" last>
					<div className="seg" role="group" aria-label="Theme">
						{THEME_OPTIONS.map((option) => (
							<button
								key={option.mode}
								type="button"
								aria-pressed={mode === option.mode}
								className={mode === option.mode ? 'on' : undefined}
								onClick={() => setMode(option.mode)}
							>
								{option.label}
							</button>
						))}
					</div>
				</SettingsRow>
			</SettingsSection>
		</section>
	)
}
