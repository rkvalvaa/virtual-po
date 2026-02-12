"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/session";
import {
  markAsRead,
  markAllAsRead,
  getNotificationsByUser,
  getUnreadCount,
} from "@/lib/db/queries/notifications";
import "@/lib/auth/types";

export async function markNotificationRead(notificationId: string) {
  const session = await requireAuth();
  await markAsRead(notificationId, session.user.id);
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead() {
  const session = await requireAuth();
  await markAllAsRead(session.user.id);
  revalidatePath("/", "layout");
}

export async function fetchNotifications() {
  const session = await requireAuth();
  const [notifications, unreadCount] = await Promise.all([
    getNotificationsByUser(session.user.id, 20),
    getUnreadCount(session.user.id),
  ]);
  return {
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      link: n.link,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
  };
}
