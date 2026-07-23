import { Sidebar } from "@/components/app/Sidebar";
import { Topbar } from "@/components/app/Topbar";
import {
  getCurrentWorkspace,
  listUserWorkspaces,
  requireUser,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [workspace, workspaces] = await Promise.all([
    getCurrentWorkspace(),
    listUserWorkspaces(user.id),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-page md:flex-row">
      {/* Mobile brand bar */}
      <div className="flex items-center border-b border-hairline bg-card px-5 py-3 md:hidden">
        <span className="font-display text-lg font-semibold text-ink">
          RenewFlow
        </span>
      </div>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          workspaces={workspaces}
          currentWorkspaceId={workspace.id}
          userName={user.name || user.email}
          userEmail={user.email}
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 pb-20 sm:px-8 md:pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}
