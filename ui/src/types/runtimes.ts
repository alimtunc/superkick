import type { AgentProvider } from './agents'

export type RuntimeMode = 'local' | 'remote'

export type RuntimeStatus = 'online' | 'offline' | 'degraded'

export type ProviderStatus = 'available' | 'unavailable' | 'stale'

export interface RuntimeCapabilities {
	supports_pty: boolean
	supports_protocol: boolean
	supports_resume: boolean
	supports_mcp_config: boolean
	supports_structured_tools: boolean
	supports_usage: boolean
}

export interface Runtime {
	id: string
	name: string
	mode: RuntimeMode
	status: RuntimeStatus
	host_label: string | null
	platform: string | null
	arch: string | null
	last_seen_at: string | null
	created_at: string
	updated_at: string
}

export interface RuntimeProvider {
	id: string
	runtime_id: string
	kind: AgentProvider
	executable_path: string | null
	version: string | null
	status: ProviderStatus
	capabilities: RuntimeCapabilities
	last_seen_at: string | null
	created_at: string
	updated_at: string
}

export type RuntimeWithProviders = Runtime & {
	providers: RuntimeProvider[]
}

export interface RuntimesResponse {
	runtimes: RuntimeWithProviders[]
}
