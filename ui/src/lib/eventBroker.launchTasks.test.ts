import type { SseHandlers } from '@/api'
import type { LaunchTaskBrokerNotice, LaunchTaskEvent } from '@/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createLaunchTaskBroker } from './eventBroker'

function stepStarted(taskId: string, issueId: string): LaunchTaskEvent {
	return {
		kind: 'step_started',
		task_id: taskId,
		linear_issue_id: issueId,
		step_id: 'step-1',
		step_kind: 'plan',
		agent_name: 'planner',
		sequence: 1
	}
}

/**
 * In-memory replacement for the EventSource subscribe function. Counts how
 * many times `start()` opens a stream and exposes `emit*` helpers so tests
 * drive the broker without a real HTTP connection.
 */
function createSubscribeHarness() {
	const handlers: SseHandlers<LaunchTaskEvent>[] = []
	let opens = 0
	let stops = 0
	return {
		opens: () => opens,
		stops: () => stops,
		current: () => handlers[handlers.length - 1] ?? null,
		subscribe: (h: SseHandlers<LaunchTaskEvent>) => {
			opens += 1
			handlers.push(h)
			return () => {
				stops += 1
			}
		}
	}
}

describe('LaunchTaskEventBroker', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('fans out published events to all matching subscribers', () => {
		const broker = createLaunchTaskBroker(createSubscribeHarness().subscribe)
		const received: LaunchTaskBrokerNotice[] = []
		broker.subscribe({}, (n) => received.push(n))
		broker.subscribe({}, (n) => received.push(n))

		broker.publishForTest(stepStarted('task-a', 'SUP-1'))

		expect(received).toHaveLength(2)
		expect(received[0]).toMatchObject({ kind: 'step_started', task_id: 'task-a' })
	})

	it('filters by linearIssueId — non-matching subscribers do not receive', () => {
		const broker = createLaunchTaskBroker(createSubscribeHarness().subscribe)
		const matched: LaunchTaskBrokerNotice[] = []
		const skipped: LaunchTaskBrokerNotice[] = []
		broker.subscribe({ linearIssueId: 'SUP-1' }, (n) => matched.push(n))
		broker.subscribe({ linearIssueId: 'SUP-9' }, (n) => skipped.push(n))

		broker.publishForTest(stepStarted('task-a', 'SUP-1'))

		expect(matched).toHaveLength(1)
		expect(skipped).toHaveLength(0)
	})

	it('unsubscribe stops the subscriber from receiving further events', () => {
		const broker = createLaunchTaskBroker(createSubscribeHarness().subscribe)
		const received: LaunchTaskBrokerNotice[] = []
		const unsubscribe = broker.subscribe({}, (n) => received.push(n))

		broker.publishForTest(stepStarted('task-a', 'SUP-1'))
		unsubscribe()
		broker.publishForTest(stepStarted('task-b', 'SUP-1'))

		expect(received).toHaveLength(1)
	})

	it('start() is idempotent — double-call opens exactly one EventSource', () => {
		const harness = createSubscribeHarness()
		const broker = createLaunchTaskBroker(harness.subscribe)

		broker.start()
		broker.start()

		expect(harness.opens()).toBe(1)
	})

	it('broadcasts a LaggedNotice to every subscriber regardless of filter', () => {
		const harness = createSubscribeHarness()
		const broker = createLaunchTaskBroker(harness.subscribe)
		broker.start()
		const matched: LaunchTaskBrokerNotice[] = []
		const filtered: LaunchTaskBrokerNotice[] = []
		broker.subscribe({}, (n) => matched.push(n))
		broker.subscribe({ linearIssueId: 'SUP-9' }, (n) => filtered.push(n))

		harness.current()?.onLagged?.(42)

		expect(matched).toEqual([{ type: 'lagged', skipped: 42 }])
		expect(filtered).toEqual([{ type: 'lagged', skipped: 42 }])
	})

	it('reconnects with exponential backoff after onError, capped at 10s', () => {
		const harness = createSubscribeHarness()
		const broker = createLaunchTaskBroker(harness.subscribe)
		broker.start()
		expect(harness.opens()).toBe(1)

		harness.current()?.onError?.(new Event('error'))
		vi.advanceTimersByTime(500)
		expect(harness.opens()).toBe(2)

		harness.current()?.onError?.(new Event('error'))
		vi.advanceTimersByTime(1_000)
		expect(harness.opens()).toBe(3)

		harness.current()?.onError?.(new Event('error'))
		vi.advanceTimersByTime(2_000)
		expect(harness.opens()).toBe(4)
	})

	it('resets the reconnect delay after a successful event', () => {
		const harness = createSubscribeHarness()
		const broker = createLaunchTaskBroker(harness.subscribe)
		broker.start()

		harness.current()?.onError?.(new Event('error'))
		vi.advanceTimersByTime(500)
		harness.current()?.onError?.(new Event('error'))
		vi.advanceTimersByTime(1_000)
		expect(harness.opens()).toBe(3)

		harness.current()?.onEvent(stepStarted('task-a', 'SUP-1'))
		harness.current()?.onError?.(new Event('error'))
		vi.advanceTimersByTime(500)

		expect(harness.opens()).toBe(4)
	})

	it('exposes a connection signal that flips on events and errors', () => {
		const harness = createSubscribeHarness()
		const broker = createLaunchTaskBroker(harness.subscribe)
		const observed: boolean[] = []
		broker.subscribeConnection((connected) => observed.push(connected))
		broker.start()
		expect(broker.isConnected()).toBe(false)

		harness.current()?.onEvent(stepStarted('task-a', 'SUP-1'))
		expect(broker.isConnected()).toBe(true)

		harness.current()?.onError?.(new Event('error'))
		expect(broker.isConnected()).toBe(false)

		expect(observed).toEqual([false, true, false])
	})

	it('stop() does not schedule a reconnect', () => {
		const harness = createSubscribeHarness()
		const broker = createLaunchTaskBroker(harness.subscribe)
		broker.start()
		broker.stop()
		harness.current()?.onError?.(new Event('error'))
		vi.advanceTimersByTime(10_000)
		expect(harness.opens()).toBe(1)
	})
})
