import { requireAuth } from "@/lib/auth/session";
import { signOut } from "@/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { KeyboardShortcuts } from "@/components/layout/KeyboardShortcuts";
import { getNotificationsByUser, getUnreadCount } from "@/lib/db/queries/notifications";
import { listUserWorkspaces } from '@/lib/db/queries/workspaces';
import { WorkspaceSessionGuard } from '@/components/layout/WorkspaceSessionGuard';
import { redirect } from 'next/navigation';
import "@/lib/auth/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();
  const user = session.user;
  if (!user.orgId) redirect('/login');

  const [notifications, unreadCount, workspaces] = await Promise.all([
    getNotificationsByUser(user.id, user.orgId, 20),
    getUnreadCount(user.id, user.orgId),
    listUserWorkspaces(user.id),
  ]);

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <WorkspaceSessionGuard userId={user.id} orgId={user.orgId} role={user.role}>
    <div className="min-h-screen bg-background">
      <Sidebar
        activeOrgId={user.orgId}
        workspaces={workspaces}
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
      <main className="min-h-screen px-4 py-8 sm:px-6 md:ml-[256px] lg:px-8">
        {children}
      </main>
      <KeyboardShortcuts />
    </div>
    </WorkspaceSessionGuard>
  );
}
