import { requireAuth } from "@/lib/auth/session"
import { NewRequestContent } from "./NewRequestContent"

export default async function NewRequestPage() {
  await requireAuth()

  return <NewRequestContent />
}
