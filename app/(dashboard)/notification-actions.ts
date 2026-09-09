"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  const orgId = session.user.orgId;
  if (!orgId) redirect("/login");
  await markAsRead(notificationId, session.user.id, orgId);
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead() {
  const session = await requireAuth();
  const orgId = session.user.orgId;
  if (!orgId) redirect("/login");
  await markAllAsRead(session.user.id, orgId);
  revalidatePath("/", "layout");
}

export async function fetchNotifications() {
  const session = await requireAuth();
  const orgId = session.user.orgId;
  if (!orgId) redirect("/login");
  const [notifications, unreadCount] = await Promise.all([
    getNotificationsByUser(session.user.id, orgId, 20),
    getUnreadCount(session.user.id, orgId),
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
