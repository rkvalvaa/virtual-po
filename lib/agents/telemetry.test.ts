import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAgentTelemetry } from './telemetry'
import { recordAgentUsage } from '@/lib/db/queries/agent-usage'
import { markAgentBudgetUnknown } from '@/lib/db/queries/agent-budget'

vi.mock('@/lib/db/queries/agent-usage', () => ({
  recordAgentUsage: vi.fn(),
}))
vi.mock('@/lib/db/queries/agent-budget', () => ({
  markAgentBudgetUnknown: vi.fn(),
}))

const recordAgentUsageMock = vi.mocked(recordAgentUsage)
const markAgentBudgetUnknownMock = vi.mocked(markAgentBudgetUnknown)

type FinishHandler = ReturnType<typeof createAgentTelemetry>
type FinishEvent = Parameters<FinishHandler>[0]

function makeEvent(overrides: {
  inputTokens?: number
  outputTokens?: number
  stepCount?: number
  finishReason?: string
}): FinishEvent {
  return {
    totalUsage: {
      inputTokens: overrides.inputTokens,
      outputTokens: overrides.outputTokens,
    },
    steps: new Array(overrides.stepCount ?? 1).fill({}),
    finishReason: overrides.finishReason ?? 'stop',
  } as unknown as FinishEvent
}

const PARAMS = {
  runId: 'run-1',
  agent: 'intake' as const,
  model: 'claude-sonnet-4-5-20250929',
  orgId: 'org-1',
  requestId: 'req-1',
  userId: 'user-1',
}

beforeEach(() => {
  recordAgentUsageMock.mockReset()
  recordAgentUsageMock.mockResolvedValue(undefined)
  markAgentBudgetUnknownMock.mockReset()
  markAgentBudgetUnknownMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createAgentTelemetry', () => {
  it('should record tokens, steps and finish reason from the onFinish event', async () => {
    const onFinish = createAgentTelemetry(PARAMS)
    await onFinish(makeEvent({ inputTokens: 1200, outputTokens: 340, stepCount: 3 }))

    expect(recordAgentUsageMock).toHaveBeenCalledTimes(1)
    expect(recordAgentUsageMock.mock.calls[0][0]).toMatchObject({
      organizationId: 'org-1',
      agentRunId: 'run-1',
      requestId: 'req-1',
      userId: 'user-1',
      agent: 'intake',
      model: 'claude-sonnet-4-5-20250929',
      inputTokens: 1200,
      outputTokens: 340,
      steps: 3,
      finishReason: 'stop',
    })
  })

  it('retains the reservation when either token count is missing', async () => {
    const onFinish = createAgentTelemetry(PARAMS)
    await onFinish(makeEvent({ stepCount: 1 }))

    expect(recordAgentUsageMock).not.toHaveBeenCalled()
    expect(markAgentBudgetUnknownMock).toHaveBeenCalledWith('run-1', 'USAGE_MISSING')
  })

  it('records measured zero rather than treating it as missing', async () => {
    const onFinish = createAgentTelemetry(PARAMS)
    await onFinish(makeEvent({ inputTokens: 0, outputTokens: 0 }))

    expect(recordAgentUsageMock.mock.calls[0][0]).toMatchObject({ inputTokens: 0, outputTokens: 0 })
    expect(markAgentBudgetUnknownMock).not.toHaveBeenCalled()
  })

  it('should record a non-negative duration', async () => {
    const onFinish = createAgentTelemetry(PARAMS)
    await onFinish(makeEvent({ inputTokens: 1, outputTokens: 1 }))

    const { durationMs } = recordAgentUsageMock.mock.calls[0][0]
    expect(durationMs).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(durationMs)).toBe(true)
  })

  it('should not throw when recordAgentUsage rejects', async () => {
    recordAgentUsageMock.mockRejectedValue(new Error('db down'))
    const onFinish = createAgentTelemetry(PARAMS)

    await expect(
      onFinish(makeEvent({ inputTokens: 10, outputTokens: 5 }))
    ).resolves.toBeUndefined()
    expect(markAgentBudgetUnknownMock).toHaveBeenCalledWith('run-1', 'USAGE_RECORD_FAILED')
    expect(console.error).toHaveBeenCalled()
  })

  it('should emit an agent.finish log line', async () => {
    const onFinish = createAgentTelemetry(PARAMS)
    await onFinish(makeEvent({ inputTokens: 7, outputTokens: 8, stepCount: 2 }))

    const line = vi.mocked(console.log).mock.calls[0][0] as string
    expect(JSON.parse(line)).toMatchObject({
      level: 'info',
      event: 'agent.finish',
      agent: 'intake',
      inputTokens: 7,
      outputTokens: 8,
      steps: 2,
    })
  })
})
