import { RULES_FIXTURE } from '@/components/settings/rulesFixture'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { Pill, type PillTone } from '@/components/ui/pill'
import type { SettingsRule } from '@/types'
import { Btn } from '@/ui/Btn'

const STATUS_TONE: Record<SettingsRule['status'], PillTone> = {
	on: 'success',
	off: 'warn',
	'dry-run': 'info'
}

export function SettingsPaneRules() {
	const lastIndex = RULES_FIXTURE.length - 1
	return (
		<section>
			<h2 className="mb-1.5 text-[18px] font-semibold text-fg">Rules &amp; guardrails</h2>
			<p className="mb-[22px] text-[13px] leading-[1.55] text-fg-muted">
				Conditions that pause an agent and surface it in your Inbox. Defined as plain English;
				Superkick compiles them to checks per run.
			</p>
			{RULES_FIXTURE.map((rule, index) => (
				<SettingsRow key={rule.id} label={rule.label} hint={rule.hint} last={index === lastIndex}>
					<div className="flex items-center gap-2">
						<Pill tone={STATUS_TONE[rule.status]} dot size="sm">
							{rule.status}
						</Pill>
						{rule.meta ? (
							<Pill tone="neutral" size="sm">
								{rule.meta}
							</Pill>
						) : null}
						<span className="flex-1" />
						<Btn kind="ghost" size="sm" icon="more" aria-label="Rule actions" />
					</div>
				</SettingsRow>
			))}
			<Btn kind="secondary" size="md" icon="plus" className="mt-5">
				Add a rule
			</Btn>
		</section>
	)
}
