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
      <div className="flex items-center gap-2 border-b border-hairline bg-card px-5 py-3 md:hidden">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M7 16c2.5-1 4-3.2 4-6.2C11 6.2 8.8 3.5 5.8 3 7.2 7.5 5.5 11.2 3 13.5c2.2.2 3.4 1.2 4 2.5Z"
              fill="currentColor"
            />
            <path
              d="M14 20c2.8-1.2 4.5-3.8 4.5-7.2 0-4.2-2.5-7.2-5.8-7.8 1.5 5 0 9-3.2 11.5 2.5.2 3.8 1.4 4.5 3.5Z"
              fill="currentColor"
              opacity="0.7"
            />
          </svg>
        </span>
        <span className="text-base font-semibold text-ink">RenewFlow</span>
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
