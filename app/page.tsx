import Image from "next/image";
import Link from "next/link";

export default function MarketingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden text-foreground">
      {/* Full-bleed atmospheric hero — matches Ink & Flow mockup */}
      <div className="pointer-events-none absolute inset-0">
        <Image
          src="/hero-flow-mountains.png"
          alt=""
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-[#e8eeeb]/92 via-[#e8eeeb]/55 to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-[#dce6e2]/40 via-transparent to-[#eef3f0]/30"
        />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 sm:px-10">
          <Link
            href="/"
            className="font-display text-[1.65rem] font-semibold tracking-tight text-ink sm:text-3xl"
          >
            RenewFlow
          </Link>
          <div className="flex items-center gap-5">
            <Link
              href="/login"
              className="text-sm font-medium text-ink transition hover:text-accent"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold text-accent transition hover:text-teal/80"
            >
              Sign up
            </Link>
          </div>
        </header>

        <main className="mx-auto flex min-h-[72vh] w-full max-w-6xl flex-1 flex-col justify-center px-6 pb-20 pt-6 sm:px-10 sm:pb-28">
          <div className="max-w-[34rem]">
            <h1 className="animate-rise font-display text-[2.35rem] font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl lg:text-[3.35rem]">
              Recover failed renewals before they turn into churn.
            </h1>
            <p className="animate-rise-delay-1 mt-5 max-w-[28rem] text-[0.95rem] leading-relaxed text-[#3d4f47] sm:text-lg">
              RenewFlow helps revenue teams detect at-risk accounts, take action,
              and protect recurring revenue.
            </p>
            <div className="animate-rise-delay-2 mt-8 flex flex-wrap items-center gap-5">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-[#0c6b59] hover:shadow-lift active:scale-[0.98]"
              >
                Request early access
              </Link>
              <Link
                href="/login"
                className="text-sm font-medium text-ink underline decoration-ink/40 underline-offset-4 transition hover:text-accent hover:decoration-accent"
              >
                Log in
              </Link>
            </div>
          </div>
        </main>

        <section className="relative border-t border-hairline/70 bg-paper/90 backdrop-blur-md">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10 sm:py-20">
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
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
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
