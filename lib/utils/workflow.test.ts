import { describe, it, expect } from 'vitest'
import { canTransition, getValidTransitions, getAvailableActions, formatStatus } from './workflow'

describe('canTransition', () => {
  it('should allow DRAFT to INTAKE_IN_PROGRESS', () => {
    expect(canTransition('DRAFT', 'INTAKE_IN_PROGRESS')).toBe(true)
  })

  it('should not allow DRAFT to APPROVED', () => {
    expect(canTransition('DRAFT', 'APPROVED')).toBe(false)
  })

  it('should allow INTAKE_IN_PROGRESS to PENDING_ASSESSMENT', () => {
    expect(canTransition('INTAKE_IN_PROGRESS', 'PENDING_ASSESSMENT')).toBe(true)
  })

  it('should allow INTAKE_IN_PROGRESS to DRAFT (back)', () => {
    expect(canTransition('INTAKE_IN_PROGRESS', 'DRAFT')).toBe(true)
  })

  it('should allow PENDING_ASSESSMENT to UNDER_REVIEW', () => {
    expect(canTransition('PENDING_ASSESSMENT', 'UNDER_REVIEW')).toBe(true)
  })

  it('should allow UNDER_REVIEW to APPROVED', () => {
    expect(canTransition('UNDER_REVIEW', 'APPROVED')).toBe(true)
  })

  it('should allow UNDER_REVIEW to REJECTED', () => {
    expect(canTransition('UNDER_REVIEW', 'REJECTED')).toBe(true)
  })

  it('should allow UNDER_REVIEW to DEFERRED', () => {
    expect(canTransition('UNDER_REVIEW', 'DEFERRED')).toBe(true)
  })

  it('should allow UNDER_REVIEW to NEEDS_INFO', () => {
    expect(canTransition('UNDER_REVIEW', 'NEEDS_INFO')).toBe(true)
  })

  it('should allow NEEDS_INFO to UNDER_REVIEW', () => {
    expect(canTransition('NEEDS_INFO', 'UNDER_REVIEW')).toBe(true)
  })

  it('should allow NEEDS_INFO to DEFERRED', () => {
    expect(canTransition('NEEDS_INFO', 'DEFERRED')).toBe(true)
  })

  it('should allow APPROVED to IN_BACKLOG', () => {
    expect(canTransition('APPROVED', 'IN_BACKLOG')).toBe(true)
  })

  it('should not allow any transition from REJECTED (terminal)', () => {
    expect(canTransition('REJECTED', 'DRAFT')).toBe(false)
    expect(canTransition('REJECTED', 'UNDER_REVIEW')).toBe(false)
  })

  it('should not allow any transition from COMPLETED (terminal)', () => {
    expect(canTransition('COMPLETED', 'DRAFT')).toBe(false)
    expect(canTransition('COMPLETED', 'IN_PROGRESS')).toBe(false)
  })

  it('should allow DEFERRED to UNDER_REVIEW', () => {
    expect(canTransition('DEFERRED', 'UNDER_REVIEW')).toBe(true)
  })

  it('should allow IN_BACKLOG to IN_PROGRESS', () => {
    expect(canTransition('IN_BACKLOG', 'IN_PROGRESS')).toBe(true)
  })

  it('should allow IN_PROGRESS to COMPLETED', () => {
    expect(canTransition('IN_PROGRESS', 'COMPLETED')).toBe(true)
  })

  it('should allow IN_PROGRESS to IN_BACKLOG', () => {
    expect(canTransition('IN_PROGRESS', 'IN_BACKLOG')).toBe(true)
  })

  it('should not allow skipping statuses', () => {
    expect(canTransition('DRAFT', 'UNDER_REVIEW')).toBe(false)
    expect(canTransition('DRAFT', 'COMPLETED')).toBe(false)
    expect(canTransition('PENDING_ASSESSMENT', 'APPROVED')).toBe(false)
  })
})

describe('getValidTransitions', () => {
  it('should return [INTAKE_IN_PROGRESS] for DRAFT', () => {
    expect(getValidTransitions('DRAFT')).toEqual(['INTAKE_IN_PROGRESS'])
  })

  it('should return [PENDING_ASSESSMENT, DRAFT] for INTAKE_IN_PROGRESS', () => {
    expect(getValidTransitions('INTAKE_IN_PROGRESS')).toEqual(['PENDING_ASSESSMENT', 'DRAFT'])
  })

  it('should return [UNDER_REVIEW] for PENDING_ASSESSMENT', () => {
    expect(getValidTransitions('PENDING_ASSESSMENT')).toEqual(['UNDER_REVIEW'])
  })

  it('should return four options for UNDER_REVIEW', () => {
    expect(getValidTransitions('UNDER_REVIEW')).toEqual(['APPROVED', 'REJECTED', 'DEFERRED', 'NEEDS_INFO'])
  })

  it('should return [UNDER_REVIEW, DEFERRED] for NEEDS_INFO', () => {
    expect(getValidTransitions('NEEDS_INFO')).toEqual(['UNDER_REVIEW', 'DEFERRED'])
  })

  it('should return [IN_BACKLOG] for APPROVED', () => {
    expect(getValidTransitions('APPROVED')).toEqual(['IN_BACKLOG'])
  })

  it('should return empty array for REJECTED (terminal)', () => {
    expect(getValidTransitions('REJECTED')).toEqual([])
  })

  it('should return [UNDER_REVIEW] for DEFERRED', () => {
    expect(getValidTransitions('DEFERRED')).toEqual(['UNDER_REVIEW'])
  })

  it('should return [IN_PROGRESS] for IN_BACKLOG', () => {
    expect(getValidTransitions('IN_BACKLOG')).toEqual(['IN_PROGRESS'])
  })

  it('should return [COMPLETED, IN_BACKLOG] for IN_PROGRESS', () => {
    expect(getValidTransitions('IN_PROGRESS')).toEqual(['COMPLETED', 'IN_BACKLOG'])
  })

  it('should return empty array for COMPLETED (terminal)', () => {
    expect(getValidTransitions('COMPLETED')).toEqual([])
  })
})

describe('getAvailableActions', () => {
  describe('DRAFT status', () => {
    it('should return start_intake for STAKEHOLDER', () => {
      const actions = getAvailableActions('DRAFT', 'STAKEHOLDER')
      expect(actions).toHaveLength(1)
      expect(actions[0].label).toBe('Start Intake')
      expect(actions[0].targetStatus).toBe('INTAKE_IN_PROGRESS')
    })

    it('should return start_intake for REVIEWER (higher role)', () => {
      const actions = getAvailableActions('DRAFT', 'REVIEWER')
      expect(actions).toHaveLength(1)
      expect(actions[0].label).toBe('Start Intake')
    })

    it('should return start_intake for ADMIN', () => {
      const actions = getAvailableActions('DRAFT', 'ADMIN')
      expect(actions).toHaveLength(1)
      expect(actions[0].label).toBe('Start Intake')
    })
  })

  describe('UNDER_REVIEW status', () => {
    it('should return approve/reject/defer/request_info for REVIEWER', () => {
      const actions = getAvailableActions('UNDER_REVIEW', 'REVIEWER')
      expect(actions).toHaveLength(4)
      const labels = actions.map((a) => a.label)
      expect(labels).toContain('Approve')
      expect(labels).toContain('Reject')
      expect(labels).toContain('Defer')
      expect(labels).toContain('Request Info')
    })

    it('should return empty for STAKEHOLDER (all require REVIEWER)', () => {
      const actions = getAvailableActions('UNDER_REVIEW', 'STAKEHOLDER')
      expect(actions).toHaveLength(0)
    })

    it('should return all four actions for ADMIN', () => {
      const actions = getAvailableActions('UNDER_REVIEW', 'ADMIN')
      expect(actions).toHaveLength(4)
    })

    it('should have correct variants for review actions', () => {
      const actions = getAvailableActions('UNDER_REVIEW', 'REVIEWER')
      const approve = actions.find((a) => a.label === 'Approve')
      const reject = actions.find((a) => a.label === 'Reject')
      const defer = actions.find((a) => a.label === 'Defer')
      const requestInfo = actions.find((a) => a.label === 'Request Info')
      expect(approve?.variant).toBe('default')
      expect(reject?.variant).toBe('destructive')
      expect(defer?.variant).toBe('outline')
      expect(requestInfo?.variant).toBe('secondary')
    })
  })

  describe('NEEDS_INFO status', () => {
    it('should return reopen and defer for REVIEWER', () => {
      const actions = getAvailableActions('NEEDS_INFO', 'REVIEWER')
      expect(actions).toHaveLength(2)
      const labels = actions.map((a) => a.label)
      expect(labels).toContain('Reopen Review')
      expect(labels).toContain('Defer')
    })

    it('should return empty for STAKEHOLDER', () => {
      const actions = getAvailableActions('NEEDS_INFO', 'STAKEHOLDER')
      expect(actions).toHaveLength(0)
    })
  })

  describe('APPROVED status', () => {
    it('should return move_to_backlog for REVIEWER', () => {
      const actions = getAvailableActions('APPROVED', 'REVIEWER')
      expect(actions).toHaveLength(1)
      expect(actions[0].label).toBe('Move to Backlog')
      expect(actions[0].targetStatus).toBe('IN_BACKLOG')
    })

    it('should return empty for STAKEHOLDER', () => {
      expect(getAvailableActions('APPROVED', 'STAKEHOLDER')).toHaveLength(0)
    })
  })

  describe('terminal and no-action statuses', () => {
    it('should return empty for REJECTED', () => {
      expect(getAvailableActions('REJECTED', 'ADMIN')).toHaveLength(0)
    })

    it('should return empty for COMPLETED', () => {
      expect(getAvailableActions('COMPLETED', 'ADMIN')).toHaveLength(0)
    })

    it('should return empty for INTAKE_IN_PROGRESS', () => {
      expect(getAvailableActions('INTAKE_IN_PROGRESS', 'ADMIN')).toHaveLength(0)
    })

    it('should return empty for PENDING_ASSESSMENT', () => {
      expect(getAvailableActions('PENDING_ASSESSMENT', 'ADMIN')).toHaveLength(0)
    })
  })

  describe('IN_BACKLOG status', () => {
    it('should return start_work for REVIEWER', () => {
      const actions = getAvailableActions('IN_BACKLOG', 'REVIEWER')
      expect(actions).toHaveLength(1)
      expect(actions[0].label).toBe('Start Work')
      expect(actions[0].targetStatus).toBe('IN_PROGRESS')
    })
  })

  describe('IN_PROGRESS status', () => {
    it('should return mark_complete and return_to_backlog for REVIEWER', () => {
      const actions = getAvailableActions('IN_PROGRESS', 'REVIEWER')
      expect(actions).toHaveLength(2)
      const labels = actions.map((a) => a.label)
      expect(labels).toContain('Mark Complete')
      expect(labels).toContain('Return to Backlog')
    })

    it('should return empty for STAKEHOLDER', () => {
      expect(getAvailableActions('IN_PROGRESS', 'STAKEHOLDER')).toHaveLength(0)
    })
  })

  describe('DEFERRED status', () => {
    it('should return reopen for REVIEWER', () => {
      const actions = getAvailableActions('DEFERRED', 'REVIEWER')
      expect(actions).toHaveLength(1)
      expect(actions[0].label).toBe('Reopen Review')
      expect(actions[0].targetStatus).toBe('UNDER_REVIEW')
    })
  })
})

describe('formatStatus', () => {
  it('should format UNDER_REVIEW as Under Review', () => {
    expect(formatStatus('UNDER_REVIEW')).toBe('Under Review')
  })

  it('should format INTAKE_IN_PROGRESS as Intake In Progress', () => {
    expect(formatStatus('INTAKE_IN_PROGRESS')).toBe('Intake In Progress')
  })

  it('should format DRAFT as Draft', () => {
    expect(formatStatus('DRAFT')).toBe('Draft')
  })

  it('should format PENDING_ASSESSMENT as Pending Assessment', () => {
    expect(formatStatus('PENDING_ASSESSMENT')).toBe('Pending Assessment')
  })

  it('should format NEEDS_INFO as Needs Info', () => {
    expect(formatStatus('NEEDS_INFO')).toBe('Needs Info')
  })

  it('should format IN_BACKLOG as In Backlog', () => {
    expect(formatStatus('IN_BACKLOG')).toBe('In Backlog')
  })

  it('should format COMPLETED as Completed', () => {
    expect(formatStatus('COMPLETED')).toBe('Completed')
  })

  it('should format IN_PROGRESS as In Progress', () => {
    expect(formatStatus('IN_PROGRESS')).toBe('In Progress')
  })
})
