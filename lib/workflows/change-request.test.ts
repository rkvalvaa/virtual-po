import { describe, expect, it } from 'vitest'
import {
  CHANGE_STATES,
  CURRENT_CHANGE_WORKFLOW_VERSION,
  allowedTransitions,
  changeWorkflow,
  findTransition,
  type ChangeState,
} from './change-request'

const v1 = changeWorkflow(1)

function reachable(from: ChangeState): Set<ChangeState> {
  const seen = new Set<ChangeState>([from])
  const queue = [from]
  while (queue.length) {
    const state = queue.shift()!
    for (const t of v1.transitions.filter(t => t.from === state)) {
      if (!seen.has(t.to)) { seen.add(t.to); queue.push(t.to) }
    }
  }
  return seen
}

describe('change-request workflow v1', () => {
  it('is the current version and starts at Submitted', () => {
    expect(CURRENT_CHANGE_WORKFLOW_VERSION).toBe(1)
    expect(v1.initial).toBe('SUBMITTED')
  })

  it('labels every state, reaches every state from the start, and leaves no state without a way out', () => {
    for (const state of CHANGE_STATES) {
      expect(v1.states[state], state).toBeTruthy()
      expect(v1.transitions.some(t => t.from === state), `${state} has no way out`).toBe(true)
    }
    expect([...reachable(v1.initial)].sort()).toEqual([...CHANGE_STATES].sort())
  })

  it('only uses known states, never repeats a move, and never moves to the same state', () => {
    const seen = new Set<string>()
    for (const t of v1.transitions) {
      expect(CHANGE_STATES).toContain(t.from)
      expect(CHANGE_STATES).toContain(t.to)
      expect(t.to).not.toBe(t.from)
      expect(seen.has(`${t.from}>${t.to}`), `${t.from} > ${t.to} twice`).toBe(false)
      seen.add(`${t.from}>${t.to}`)
    }
  })

  it('needs an admin and an implementation plan to approve into Scheduled', () => {
    const approve = findTransition(v1, 'AWAITING_APPROVAL', 'SCHEDULED')
    expect(approve).toMatchObject({ minRole: 'ADMIN' })
    expect(approve?.requires).toContain('implementationPlan')
    for (const t of v1.transitions.filter(t => t.to === 'SCHEDULED')) expect(t.minRole).toBe('ADMIN')
  })

  it('asks for evidence before validation, validation notes before closing, and a reason to reject or reopen', () => {
    expect(findTransition(v1, 'IMPLEMENTING', 'VALIDATING')?.requires).toContain('implementationEvidence')
    expect(findTransition(v1, 'VALIDATING', 'CLOSED')?.requires).toContain('validationNotes')
    for (const t of v1.transitions.filter(t => t.to === 'REJECTED')) expect(t.reason, `${t.from} > REJECTED`).toBe(true)
    for (const from of ['CLOSED', 'REJECTED'] as const) {
      const reopen = v1.transitions.filter(t => t.from === from)
      expect(reopen.length, `reopen from ${from}`).toBeGreaterThan(0)
      for (const t of reopen) expect(t.reason).toBe(true)
    }
  })

  it('offers each role only the moves it may make', () => {
    expect(allowedTransitions(v1, 'SUBMITTED', 'STAKEHOLDER')).toEqual([])
    expect(allowedTransitions(v1, 'AWAITING_APPROVAL', 'REVIEWER')).toEqual([])
    expect(allowedTransitions(v1, 'AWAITING_APPROVAL', 'ADMIN').map(t => t.to)).toContain('SCHEDULED')
    expect(allowedTransitions(v1, 'SUBMITTED', 'ADMIN').map(t => t.to).sort()).toEqual(['ASSESSING', 'REJECTED'])
  })

  it('refuses an unknown version rather than guessing', () => {
    expect(() => changeWorkflow(99)).toThrow(/version 99/)
  })
})
