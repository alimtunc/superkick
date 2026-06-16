/** Project entry exposed by the Tauri shell (`list_projects`). */
export interface DesktopProject {
	id: string
	name: string
	path: string
	last_opened_at: string | null
	has_linear_key: boolean
	attention_count: number
}

export interface DesktopRegistrySnapshot {
	projects: DesktopProject[]
	active_id: string | null
}
