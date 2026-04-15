export interface ReviewFinding {
	agent_name: string
	session_id: string
	passed: boolean
	exit_code: number | null
}

export interface ReviewSwarmResult {
	findings: ReviewFinding[]
	total_agents: number
	passed_count: number
	failed_count: number
	gate_passed: boolean
}
