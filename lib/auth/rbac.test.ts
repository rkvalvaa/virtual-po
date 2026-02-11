import { describe, it, expect } from 'vitest'
import { canAccess } from './rbac'
import type { UserRole } from '@/lib/types/database'

describe('canAccess', () => {
  describe('ADMIN role', () => {
    it('should access ADMIN-required resources', () => {
      expect(canAccess('ADMIN', 'ADMIN')).toBe(true)
    })

    it('should access REVIEWER-required resources', () => {
      expect(canAccess('ADMIN', 'REVIEWER')).toBe(true)
    })

    it('should access STAKEHOLDER-required resources', () => {
      expect(canAccess('ADMIN', 'STAKEHOLDER')).toBe(true)
    })
  })

  describe('REVIEWER role', () => {
    it('should access REVIEWER-required resources', () => {
      expect(canAccess('REVIEWER', 'REVIEWER')).toBe(true)
    })

    it('should access STAKEHOLDER-required resources', () => {
      expect(canAccess('REVIEWER', 'STAKEHOLDER')).toBe(true)
    })

    it('should not access ADMIN-required resources', () => {
      expect(canAccess('REVIEWER', 'ADMIN')).toBe(false)
    })
  })

  describe('STAKEHOLDER role', () => {
    it('should access STAKEHOLDER-required resources', () => {
      expect(canAccess('STAKEHOLDER', 'STAKEHOLDER')).toBe(true)
    })

    it('should not access REVIEWER-required resources', () => {
      expect(canAccess('STAKEHOLDER', 'REVIEWER')).toBe(false)
    })

    it('should not access ADMIN-required resources', () => {
      expect(canAccess('STAKEHOLDER', 'ADMIN')).toBe(false)
    })
  })

  describe('same role always returns true', () => {
    const roles: UserRole[] = ['STAKEHOLDER', 'REVIEWER', 'ADMIN']
    for (const role of roles) {
      it(`should return true when both userRole and requiredRole are ${role}`, () => {
        expect(canAccess(role, role)).toBe(true)
      })
    }
  })
})
