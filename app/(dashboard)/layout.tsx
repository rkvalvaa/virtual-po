import { requireAuth } from "@/lib/auth/session";
import { signOut } from "@/auth";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();
  const user = session.user;

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
      />
      <main className="min-h-screen px-4 py-8 sm:px-6 md:ml-64 lg:px-8">
        {children}
      </main>
    </div>
  );
}
