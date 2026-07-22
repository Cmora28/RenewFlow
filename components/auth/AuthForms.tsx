"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { registerAccount } from "@/lib/actions/auth";

export function SignupForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await registerAccount(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }

          const email = String(formData.get("email") || "");
          const password = String(formData.get("password") || "");
          const signInResult = await signIn("credentials", {
            email,
            password,
            redirect: false,
          });

          if (signInResult?.error) {
            setError("Account created, but sign-in failed. Please log in.");
            router.push("/login");
            return;
          }

          router.push("/dashboard");
          router.refresh();
        });
      }}
    >
      <Field label="Your name" name="name" required />
      <Field label="Work email" name="email" type="email" required />
      <Field
        label="Password"
        name="password"
        type="password"
        minLength={8}
        required
      />
      <Field
        label="Workspace name"
        name="workspaceName"
        placeholder="Acme Billing"
        required
      />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await signIn("credentials", {
            email: String(formData.get("email") || ""),
            password: String(formData.get("password") || ""),
            redirect: false,
          });

          if (result?.error) {
            setError("Invalid email or password.");
            return;
          }

          router.push("/dashboard");
          router.refresh();
        });
      }}
    >
      <Field label="Email" name="email" type="email" required />
      <Field label="Password" name="password" type="password" required />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Log in"}
      </Button>
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  minLength,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
      />
    </label>
  );
}
