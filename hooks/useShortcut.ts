"use client"

import { useEffect, useRef } from "react"

export interface ShortcutOptions {
  /** Require Ctrl on non-Mac, Cmd on Mac. */
  meta?: boolean
  /** Require Shift. */
  shift?: boolean
  /** When true, fires even when the active element is an input/textarea/select
   *  or has contentEditable. Defaults to false so typing in fields doesn't
   *  trigger global shortcuts. */
  allowInForms?: boolean
}

/** A keyboard shortcut targeting the document. */
export function useShortcut(
  key: string,
  handler: (event: KeyboardEvent) => void,
  options: ShortcutOptions = {},
): void {
  // Keep the latest handler in a ref so the document listener doesn't need
  // to be re-registered on every render. Updating the ref must happen in an
  // effect — React 19's react-hooks/refs rule forbids ref mutation during
  // render.
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== key.toLowerCase()) return

      // Modifier match: meta means "platform meta" — Cmd on Mac, Ctrl elsewhere.
      // We accept either Ctrl OR Meta when meta is requested so both work
      // regardless of OS detection accuracy.
      if (options.meta && !(event.ctrlKey || event.metaKey)) return
      if (!options.meta && (event.ctrlKey || event.metaKey)) return
      if (options.shift && !event.shiftKey) return
      if (!options.shift && event.shiftKey) return

      if (!options.allowInForms && isEditableTarget(event.target)) return

      handlerRef.current(event)
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [key, options.meta, options.shift, options.allowInForms])
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (target.isContentEditable) return true
  return false
}
