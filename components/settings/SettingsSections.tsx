"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"

const groups = [
  { title: "Workspace", sections: [["organization", "Organization"], ["members", "Members"], ["repositories", "Repositories"]] },
  { title: "Planning and review", sections: [["scoring", "Scoring"], ["okrs", "OKRs"], ["capacity", "Capacity"], ["templates", "Templates"], ["custom-fields", "Custom Fields"], ["approvals", "Approvals"], ["review-cycles", "Review Cycles"]] },
  { title: "Integrations", sections: [["jira", "Jira"], ["linear", "Linear"], ["github-issues", "GitHub Issues"], ["slack", "Slack"], ["teams", "Teams"], ["api-keys", "API Keys"], ["webhooks", "Webhooks"]] },
  { title: "Personal", sections: [["email", "Email"]] },
] as const
const Selection = createContext<{ active: string; select: (value: string) => void }>({ active: "organization", select: () => {} })

export function SettingsSections({ defaultValue, children }: { defaultValue: string; children: ReactNode }) {
  const [active, select] = useState(defaultValue)
  return <Selection.Provider value={{ active, select }}>
    <div className="grid min-w-0 gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">{children}</div>
  </Selection.Provider>
}

export function SettingsNavigation() {
  const { active, select } = useContext(Selection)
  return <aside className="min-w-0">
    <div className="space-y-2 lg:hidden">
      <label htmlFor="settings-section" className="text-sm font-medium">Settings section</label>
      <select id="settings-section" value={active} onChange={event => select(event.target.value)}
        className="w-full min-w-0 rounded-md border bg-background px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {groups.map(group => <optgroup key={group.title} label={group.title}>{group.sections.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</optgroup>)}
      </select>
    </div>
    <nav aria-label="Settings sections" className="hidden space-y-5 lg:block">
      {groups.map(group => <div key={group.title} className="space-y-1">
        <p className="px-3 text-xs font-semibold text-muted-foreground">{group.title}</p>
        {group.sections.map(([value, label]) => <Button key={value} variant={active === value ? "secondary" : "ghost"}
          aria-current={active === value ? "page" : undefined} onClick={() => select(value)}
          className="h-auto w-full justify-start whitespace-normal py-2 text-left">{label}</Button>)}
      </div>)}
    </nav>
  </aside>
}

export function SettingsPanel({ value, children }: { value: string; children: ReactNode }) {
  const { active } = useContext(Selection)
  if (active !== value) return null
  const label = groups.flatMap(group => [...group.sections]).find(([id]) => id === value)?.[1] ?? value
  return <section aria-label={`${label} settings`} className="min-w-0 space-y-4 [overflow-wrap:anywhere] [&_button]:h-auto [&_button]:min-h-9 [&_button]:max-w-full [&_button]:whitespace-normal">{children}</section>
}
