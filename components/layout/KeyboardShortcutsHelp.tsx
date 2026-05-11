"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

interface KeyboardShortcutsHelpProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Shortcut {
  keys: string[]
  description: string
}

const SHORTCUTS: { group: string; items: Shortcut[] }[] = [
  {
    group: "Global",
    items: [
      { keys: ["?"], description: "Open this keyboard shortcuts help" },
      { keys: ["⌘/Ctrl", "K"], description: "Focus search" },
      { keys: ["Esc"], description: "Close dialogs / unfocus" },
    ],
  },
]

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-muted text-muted-foreground inline-flex h-6 min-w-6 items-center justify-center rounded border px-1.5 text-xs font-medium">
      {children}
    </kbd>
  )
}

export function KeyboardShortcutsHelp({
  open,
  onOpenChange,
}: KeyboardShortcutsHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Use these shortcuts to move around faster.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {SHORTCUTS.map((group) => (
            <div key={group.group} className="space-y-2">
              <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                {group.group}
              </h4>
              <ul className="space-y-1.5">
                {group.items.map((sc) => (
                  <li
                    key={sc.description}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{sc.description}</span>
                    <div className="flex items-center gap-1">
                      {sc.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && (
                            <span className="text-muted-foreground text-xs">
                              +
                            </span>
                          )}
                          <Key>{k}</Key>
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
