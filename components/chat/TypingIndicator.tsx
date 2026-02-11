"use client"

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-2">
      <div className="flex gap-1">
        <span className="bg-muted-foreground/50 size-1.5 animate-bounce rounded-full [animation-delay:0ms]" />
        <span className="bg-muted-foreground/50 size-1.5 animate-bounce rounded-full [animation-delay:150ms]" />
        <span className="bg-muted-foreground/50 size-1.5 animate-bounce rounded-full [animation-delay:300ms]" />
      </div>
    </div>
  )
}
