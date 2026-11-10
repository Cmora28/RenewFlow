import { Sidebar } from "@/components/app/Sidebar";
import { Topbar } from "@/components/app/Topbar";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [workspace, user] = await Promise.all([
    getCurrentWorkspace(),
    getCurrentUser(),
  ]);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          workspaceName={workspace.name}
          userName={user.name}
          userEmail={user.email}
        />
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
