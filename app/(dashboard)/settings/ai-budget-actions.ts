"use server"

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/session'
import { deploymentBudgetCeilingMicrousd } from '@/lib/agents/budget'
import { updateOrganizationAgentBudget } from '@/lib/db/queries/agent-budget'
import '@/lib/auth/types'

const inputSchema = z.object({
  monthlyLimitUsd: z.string().regex(/^\d+(?:\.\d{1,6})?$/),
  warningPercent: z.coerce.number().int().min(1).max(100),
  expectedVersion: z.coerce.number().int().min(0),
})

function usdToMicros(value: string): number | null {
  const [whole, fraction = ''] = value.split('.')
  const micros = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, '0'))
  return Number.isSafeInteger(micros) && micros > 0 ? micros : null
}

export async function updateAIBudgetAction(formData: FormData): Promise<{
  success: boolean
  version?: number
  error?: string
}> {
  const session = await requireAuth()
  if (!session.user.orgId) return { success: false, error: 'A current workspace is required.' }
  const parsed = inputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: 'Enter a positive monthly limit and a warning threshold from 1 to 100.' }
  const monthlyLimitMicrousd = usdToMicros(parsed.data.monthlyLimitUsd)
  if (monthlyLimitMicrousd === null) return { success: false, error: 'Enter a positive monthly limit with no more than six decimal places.' }

  let ceiling: number | null
  try {
    ceiling = deploymentBudgetCeilingMicrousd()
  } catch {
    return { success: false, error: 'The deployment AI budget ceiling is invalid. Correct the server configuration first.' }
  }
  if (ceiling === null) return { success: false, error: 'The deployment AI budget ceiling is not configured.' }
  if (monthlyLimitMicrousd > ceiling) return { success: false, error: 'The workspace limit cannot exceed the deployment ceiling.' }

  try {
    const result = await updateOrganizationAgentBudget({
      orgId: session.user.orgId,
      adminUserId: session.user.id,
      monthlyLimitMicrousd,
      warningPercent: parsed.data.warningPercent,
      expectedVersion: parsed.data.expectedVersion,
      deploymentCeilingMicrousd: ceiling,
    })
    revalidatePath('/settings')
    return { success: true, version: result.version }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/administrator|changed|deployment ceiling|warning threshold/i.test(message)) {
      return { success: false, error: message }
    }
    return { success: false, error: 'Unable to save the AI budget. Try again.' }
  }
}
