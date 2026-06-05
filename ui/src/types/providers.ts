// App-managed provider settings. Mirror
// `superkick_core::provider_settings`.
import type { AgentProvider, BillingProfile } from './agents'
import type { ReasoningEffort, StepExecutor } from './launch'

export type ProviderAvailability = 'available' | 'unavailable' | 'unknown'

export type InstallState = 'installed' | 'not_installed' | 'unknown'

export type AuthState = 'authenticated' | 'unauthenticated' | 'unknown'

export type SandboxPolicy = 'read_only' | 'workspace_write' | 'danger_full_access'

export type PermissionPolicy = 'prompt' | 'accept_edits' | 'bypass_permissions'

export interface ProviderSettings {
	provider: AgentProvider
	availability: ProviderAvailability
	install_state: InstallState
	auth_state: AuthState
	billing_mode: BillingProfile
	default_model?: string | null
	default_reasoning: ReasoningEffort
	default_executor: StepExecutor
	sandbox_policy: SandboxPolicy
	permission_policy: PermissionPolicy
	enabled: boolean
}
