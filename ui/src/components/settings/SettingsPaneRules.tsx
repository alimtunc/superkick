import { RULES_FIXTURE } from '@/components/settings/rulesFixture'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { SettingsSection } from '@/components/settings/SettingsSection'
import type { SettingsRule } from '@/types'
import { Btn } from '@/ui/Btn'

const STATUS_PILL: Record<SettingsRule['status'], string> = {
	on: 'pill--success',
	off: 'pill--warn',
	'dry-run': 'pill--neutral'
}

export function SettingsPaneRules() {
	const lastIndex = RULES_FIXTURE.length - 1
	return (
		<section>
			<h2 className="mb-7 text-[21px] font-semibold tracking-tight text-fg">Rules &amp; guardrails</h2>
			<p className="-mt-5 mb-7 text-[13px] leading-[1.55] text-fg-muted">
				Conditions that pause an agent and surface it in your Inbox. Defined as plain English;
				Superkick compiles them to checks per run.
			</p>
			<SettingsSection title="Guardrails">
				{RULES_FIXTURE.map((rule, index) => (
					<SettingsRow key={rule.id} label={rule.label} hint={rule.hint} last={index === lastIndex}>
						<div className="flex items-center gap-2">
							<span className={`pill ${STATUS_PILL[rule.status]}`}>{rule.status}</span>
							{rule.meta ? <span className="pill pill--neutral">{rule.meta}</span> : null}
							<Btn kind="ghost" size="sm" icon="more" aria-label="Rule actions" />
						</div>
					</SettingsRow>
				))}
			</SettingsSection>
			<Btn kind="secondary" size="md" icon="plus">
				Add a rule
			</Btn>
		</section>
	)
}
