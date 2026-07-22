import Link from "next/link";

export default function MarketingPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#d8efe6_0%,#f4f7f5_45%,#eef3f8_100%)] text-foreground">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <p className="text-lg font-semibold tracking-tight">RenewFlow</p>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-white/70"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:brightness-110"
          >
            Sign up
          </Link>
        </div>
      </header>

      <main className="mx-auto flex min-h-[70vh] w-full max-w-5xl flex-col justify-center px-6 pb-20 pt-10">
        <p className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-accent">
          RenewFlow
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Recover failed Stripe renewals before they turn into churn.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted text-balance">
          RenewFlow watches failed subscription payments, opens recovery cases,
          and runs email dunning with payment-update links—so revenue comes back
          before customers disappear.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:brightness-110"
          >
            Request early access
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-border bg-white/80 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-white"
          >
            Log in to your workspace
          </Link>
        </div>
      </main>
    </div>
  );
}
