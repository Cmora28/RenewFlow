import Link from "next/link";

export default function MarketingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden text-foreground">
      {/* Full-bleed atmospheric hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-hero animate-gradient-shift"
        style={{ backgroundSize: "200% 200%" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hero-flow-lines opacity-60"
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 sm:px-8">
          <Link
            href="/"
            className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl"
          >
            RenewFlow
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/login"
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground transition hover:bg-white/50"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition hover:bg-teal/90"
            >
              Sign up
            </Link>
          </div>
        </header>

        <main className="mx-auto flex flex-1 w-full max-w-6xl flex-col justify-center px-6 pb-24 pt-8 sm:px-8 sm:pb-32">
          <div className="max-w-xl">
            <h1 className="animate-rise font-display text-4xl font-semibold leading-[1.12] tracking-tight text-balance text-ink sm:text-5xl lg:text-[3.25rem]">
              Recover failed renewals before they turn into churn.
            </h1>
            <p className="animate-rise-delay-1 mt-5 max-w-md text-base leading-relaxed text-muted text-balance sm:text-lg">
              RenewFlow helps revenue teams detect at-risk accounts, take action,
              and protect recurring revenue.
            </p>
            <div className="animate-rise-delay-2 mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground transition-all duration-150 hover:bg-teal/90 active:scale-[0.98]"
              >
                Request early access
              </Link>
              <Link
                href="/login"
                className="text-sm font-medium text-accent underline-offset-4 transition hover:underline"
              >
                Log in
              </Link>
            </div>
          </div>
        </main>

        {/* Below fold: how it works */}
        <section className="relative border-t border-hairline/60 bg-paper/80 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:px-8 sm:py-20">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              How it works
            </h2>
            <p className="mt-2 max-w-lg text-sm text-muted">
              From failed payment to recovered revenue in three steps.
            </p>
            <ol className="mt-10 grid gap-8 sm:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "Detect",
                  body: "Stripe webhooks surface failed renewals the moment they happen.",
                },
                {
                  step: "02",
                  title: "Case",
                  body: "Each failure opens a recovery case with context, amount, and status.",
                },
                {
                  step: "03",
                  title: "Dunning",
                  body: "Automated email sequences nudge customers to update payment details.",
                },
              ].map((item) => (
                <li key={item.step} className="border-t border-hairline pt-6">
                  <span className="text-xs font-medium uppercase tracking-widest text-accent">
                    {item.step}
                  </span>
                  <p className="mt-2 font-display text-lg font-semibold text-ink">
                    {item.title}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {item.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </div>
  );
}
