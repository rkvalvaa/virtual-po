"use client"

import { useState } from "react"
import { useShortcut } from "@/hooks/useShortcut"
import { KeyboardShortcutsHelp } from "@/components/layout/KeyboardShortcutsHelp"

/** Custom event other components can listen for to focus a search input. */
export const FOCUS_SEARCH_EVENT = "vpo:focus-search"

/**
 * Global shortcut wiring. Mount once at the dashboard layout level.
 *
 * - `?`         Toggles the keyboard shortcuts help dialog
 * - `Ctrl/Cmd+K` Dispatches a window event search inputs can listen for
 */
export function KeyboardShortcuts() {
  const [helpOpen, setHelpOpen] = useState(false)

  useShortcut("?", (event) => {
    event.preventDefault()
    setHelpOpen((open) => !open)
  }, { shift: true })

  useShortcut("k", (event) => {
    event.preventDefault()
    window.dispatchEvent(new CustomEvent(FOCUS_SEARCH_EVENT))
  }, { meta: true })

  return <KeyboardShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
}
