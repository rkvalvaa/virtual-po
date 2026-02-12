import { requireAuth } from "@/lib/auth/session";
import { signOut } from "@/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { getNotificationsByUser, getUnreadCount } from "@/lib/db/queries/notifications";
import "@/lib/auth/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();
  const user = session.user;

  const [notifications, unreadCount] = await Promise.all([
    getNotificationsByUser(user.id, 20),
    getUnreadCount(user.id),
  ]);

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        user={{
          name: user.name ?? null,
          email: user.email ?? null,
          image: user.image ?? null,
        }}
        signOutAction={handleSignOut}
        notificationBell={
          <NotificationBell
            initialNotifications={notifications.map((n) => ({
              id: n.id,
              type: n.type,
              title: n.title,
              message: n.message,
              link: n.link,
              isRead: n.isRead,
              createdAt: n.createdAt.toISOString(),
            }))}
            initialUnreadCount={unreadCount}
          />
        }
      />
      <main className="min-h-screen px-4 py-8 sm:px-6 md:ml-64 lg:px-8">
        {children}
      </main>
    </div>
  );
}
