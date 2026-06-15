import { SettingsPaneHeader } from '@/components/settings/SettingsPaneHeader'
import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'

// SUP-206 — Skills moved out of Settings into the top-level `/skills` library.
// This pane stays as a deep-link so existing Settings navigation still finds it.
export function SettingsPaneSkillsLink() {
	return (
		<section>
			<SettingsPaneHeader
				title="Skills"
				description="The skill library moved to its own workspace page. Manage, create, and import skills there."
			/>
			<Button size="sm" render={<Link to="/skills" />}>
				Open Skills library
			</Button>
		</section>
	)
}
