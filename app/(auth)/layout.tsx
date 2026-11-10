import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-page lg:flex-row">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-ink px-10 py-12 lg:flex lg:w-[42%] lg:flex-col lg:justify-between xl:w-[38%]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 80% 60% at 80% 100%, rgba(14,122,102,0.4), transparent 60%)",
          }}
        />
        <div className="relative">
          <Link
            href="/"
            className="font-display text-2xl font-semibold tracking-tight text-sidebar-foreground"
          >
            RenewFlow
          </Link>
        </div>
        <div className="relative max-w-sm">
          <p className="font-display text-3xl font-semibold leading-snug tracking-tight text-sidebar-foreground">
            Revenue recovery, built for ops teams.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-sidebar-muted">
            Connect Stripe, monitor failed renewals, and run dunning sequences
            from one workspace.
          </p>
        </div>
        <p className="relative text-xs text-sidebar-muted">
          © RenewFlow
        </p>
      </aside>

      {/* Form panel */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between px-6 py-5 lg:hidden">
          <Link
            href="/"
            className="font-display text-xl font-semibold tracking-tight text-ink"
          >
            RenewFlow
          </Link>
        </header>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-16 pt-4 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
