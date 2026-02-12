"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import {
  FileText,
  ClipboardCheck,
  Layers,
  BarChart3,
  Settings,
  Menu,
  LogOut,
} from "lucide-react"

const navLinks = [
  { href: "/requests", label: "Requests", icon: FileText },
  { href: "/review", label: "Review", icon: ClipboardCheck },
  { href: "/backlog", label: "Backlog", icon: Layers },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
] as const

interface SidebarProps {
  user: {
    name: string | null
    email: string | null
    image: string | null
  }
  signOutAction: () => Promise<void>
  notificationBell?: React.ReactNode
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {navLinks.map((link) => {
        const isActive = pathname === link.href || pathname.startsWith(link.href + "/")
        const Icon = link.icon
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}

function UserSection({
  user,
  initials,
  signOutAction,
}: {
  user: SidebarProps["user"]
  initials: string
  signOutAction: () => Promise<void>
}) {
  return (
    <div className="border-t px-3 py-4">
      <div className="flex items-center gap-3 px-3">
        <Avatar size="sm">
          {user.image && <AvatarImage src={user.image} alt={user.name ?? ""} />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{user.name}</span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </div>
      </div>
      <form action={signOutAction} className="mt-3 px-3">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <LogOut className="size-4 shrink-0" />
          Sign out
        </button>
      </form>
    </div>
  )
}

export function Sidebar({ user, signOutAction, notificationBell }: SidebarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U"

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-background md:flex">
        <div className="flex h-14 items-center justify-between px-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            VPO
          </Link>
          {notificationBell}
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <NavLinks pathname={pathname} />
        </div>
        <UserSection user={user} initials={initials} signOutAction={signOutAction} />
      </aside>

      {/* Mobile top bar + sheet */}
      <div className="sticky top-0 z-30 flex h-14 items-center border-b bg-background px-4 md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="-ml-2">
              <Menu className="size-5" />
              <span className="sr-only">Open navigation</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0" showCloseButton={false}>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="flex h-14 items-center px-6">
              <Link
                href="/"
                className="text-lg font-bold tracking-tight"
                onClick={() => setMobileOpen(false)}
              >
                VPO
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto py-4">
              <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </div>
            <UserSection user={user} initials={initials} signOutAction={signOutAction} />
          </SheetContent>
        </Sheet>
        <span className="ml-3 flex-1 text-lg font-bold tracking-tight">VPO</span>
        {notificationBell}
      </div>
    </>
  )
}
