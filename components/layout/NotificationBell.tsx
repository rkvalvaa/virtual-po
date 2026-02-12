"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Bell, Check, CheckCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  markNotificationRead,
  markAllNotificationsRead,
} from "@/app/(dashboard)/notification-actions"

interface NotificationItem {
  id: string
  type: string
  title: string
  message: string
  link: string | null
  isRead: boolean
  createdAt: string
}

interface NotificationBellProps {
  initialNotifications: NotificationItem[]
  initialUnreadCount: number
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function NotificationBell({
  initialNotifications,
  initialUnreadCount,
}: NotificationBellProps) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleMarkRead(id: string) {
    startTransition(async () => {
      await markNotificationRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    })
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllNotificationsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
      setUnreadCount(0)
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
          <span className="sr-only">
            {unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs"
              onClick={handleMarkAllRead}
              disabled={isPending}
            >
              <CheckCheck className="mr-1 h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`flex gap-3 border-b px-4 py-3 last:border-b-0 ${
                  notification.isRead ? "opacity-60" : "bg-accent/30"
                }`}
              >
                <div className="min-w-0 flex-1">
                  {notification.link ? (
                    <Link
                      href={notification.link}
                      className="text-sm font-medium hover:underline"
                      onClick={() => {
                        if (!notification.isRead) handleMarkRead(notification.id)
                        setOpen(false)
                      }}
                    >
                      {notification.title}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium">{notification.title}</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {notification.message}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {timeAgo(notification.createdAt)}
                  </p>
                </div>
                {!notification.isRead && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => handleMarkRead(notification.id)}
                    disabled={isPending}
                  >
                    <Check className="h-3 w-3" />
                    <span className="sr-only">Mark as read</span>
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
