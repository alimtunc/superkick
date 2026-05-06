import type {
	ActiveTakeover,
	AttentionSummary,
	ConversationUxState,
	ConversationUxStateInput,
	Run,
	Turn
} from '@/types'

/**
 * SUP-110 — derive the operator-facing chat status from the data the client
 * already has. The helper is pure and stateless; callers pass whichever
 * inputs they currently hold (turns are optional, run/takeovers are only
 * available for `subject.kind === 'run'` chats today).
 *
 * Precedence (highest first), so callers can reason about edge cases:
 *
 *   taken_over  > failed  > running  > needs_human  > completed  > draft
 *
 * Notes:
 * - `taken_over` outranks `failed` on purpose — when an operator has taken
 *   the terminal over (`mode === 'force_takeover'`), surfacing the human
 *   action is more useful than surfacing a stale failure tag.
 * - An in-flight turn (`pending` / `streaming`) outranks `needs_human` so
 *   the badge tracks the agent's foreground activity, not a stale pause.
 *   `needs_human` only wins once the latest turn is no longer running.
 * - A `cancelled` last turn folds into `completed` — cancellation is a
 *   terminal state that doesn't merit a failure tone.
 */

const NEEDS_HUMAN_RUN_STATES: ReadonlySet<Run['state']> = new Set(['waiting_human'])

// `Turn[]` from the API and the React Query cache is sorted by `seq`
// ascending (see `useConversationView` / the `/conversations/:id` route),
// so the last element is always the latest. We assert that contract here
// rather than re-scan defensively — a future violation would surface as a
// stale badge, not a crash.
function pickLatestTurn(turns: readonly Turn[] | null | undefined): Turn | null {
	if (!turns || turns.length === 0) return null
	return turns[turns.length - 1] ?? null
}

function hasForceTakeover(takeovers: readonly ActiveTakeover[] | null | undefined): boolean {
	if (!takeovers || takeovers.length === 0) return false
	return takeovers.some((takeover) => takeover.mode === 'force_takeover')
}

function runNeedsHuman(run: Run | null | undefined, attention: AttentionSummary | null | undefined): boolean {
	if (run && NEEDS_HUMAN_RUN_STATES.has(run.state)) return true
	if (attention && (attention.pendingAttention > 0 || attention.pendingInterrupts > 0)) return true
	return false
}

export function deriveConversationUxState(input: ConversationUxStateInput): ConversationUxState {
	const { conversation, turns, run, takeovers, attention } = input

	if (hasForceTakeover(takeovers)) return 'taken_over'

	const latest = pickLatestTurn(turns)

	if (latest?.status === 'failed') return 'failed'
	if (latest?.status === 'pending' || latest?.status === 'streaming') return 'running'

	if (runNeedsHuman(run, attention)) return 'needs_human'

	if (latest !== null) {
		// `completed` and `cancelled` both collapse to the terminal-success
		// badge: the operator's question on this row is "is anything still
		// happening?" not "did the user cancel?" — the conversation view
		// shows the reason.
		return 'completed'
	}

	// Sidebar fallback: callers list views don't have turns loaded for every
	// row. `last_turn_at` is the cheapest "has there ever been a turn?"
	// signal we can lean on without a per-conversation fetch.
	if (conversation.last_turn_at !== null) return 'completed'

	return 'draft'
}

// `running` uses `cyan` (the convention's "in-flight" tone) rather than
// `live`/neon-green so the badge can't be confused with `completed`/mineral
// — both green tones live too close together at sidebar size.
export const conversationStateTone: Record<
	ConversationUxState,
	'neutral' | 'cyan' | 'gold' | 'mineral' | 'oxide' | 'violet'
> = {
	draft: 'neutral',
	running: 'cyan',
	needs_human: 'gold',
	completed: 'mineral',
	failed: 'oxide',
	taken_over: 'violet'
}
