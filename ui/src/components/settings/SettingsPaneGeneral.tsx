import { SettingsRow } from '@/components/settings/SettingsRow'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { useThemeStore } from '@/stores/theme'
import { Btn } from '@/ui/Btn'
import { Icon } from '@/ui/Icon'
import { Toggle } from '@/ui/Toggle'

export function SettingsPaneGeneral() {
	const theme = useThemeStore((s) => s.theme)
	const setTheme = useThemeStore((s) => s.setTheme)

	return (
		<section>
			<h2 className="mb-7 text-[21px] font-semibold tracking-tight text-fg">Settings</h2>

			<SettingsSection title="Daemon">
				<SettingsRow label="Status" hint="superkickd · port 7878">
					<span className="pill pill--success">
						<span className="agdot agdot--shipped" />
						running
					</span>
				</SettingsRow>
				<SettingsRow label="Auto-start on login" last>
					<Toggle checked disabled ariaLabel="Auto-start on login" />
				</SettingsRow>
			</SettingsSection>

			<SettingsSection title="Linear">
				<SettingsRow label="Workspace" hint="Connected · superkick.linear.app">
					<Btn size="sm">Re-sync</Btn>
				</SettingsRow>
				<SettingsRow label="Default team" last>
					<button type="button" className="select">
						Superkick
						<span className="chev">
							<Icon name="chevDown" size={14} className="ic" />
						</span>
					</button>
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
						<span className="pill pill--neutral">ticket</span>
						<span className="pill pill--neutral">review</span>
						<span className="pill pill--neutral">ship</span>
					</div>
				</SettingsRow>
			</SettingsSection>

			<SettingsSection title="Appearance">
				<SettingsRow label="Theme" hint="Live preview — flips the whole app" last>
					<div className="seg">
						<button
							type="button"
							className={theme === 'dark' ? 'on' : undefined}
							onClick={() => setTheme('dark')}
						>
							Dark
						</button>
						<button
							type="button"
							className={theme === 'light' ? 'on' : undefined}
							onClick={() => setTheme('light')}
						>
							Light
						</button>
					</div>
				</SettingsRow>
			</SettingsSection>
		</section>
	)
}
