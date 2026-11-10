import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Loader2, LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { verifiedUser } from "@/lib/auth/session";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [
    { title: "Sign in — Flight Analytics" },
    { name: "description", content: "Sign in to your secure Flight Analytics workspace." },
    { property: "og:title", content: "Sign in — Flight Analytics" },
    { property: "og:description", content: "Sign in to your secure Flight Analytics workspace." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) {
        setError(authError.code === "invalid_credentials" ? "Email or password is incorrect." : authError.message);
        return;
      }
      if (!(await verifiedUser(supabase))) {
        setError("Your session could not be verified. Please sign in again.");
        return;
      }
      await navigate({ to: "/search", replace: true });
    } catch {
      setError("Sign-in is unavailable right now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-5 py-10">
      <div className="mx-auto max-w-6xl"><Link to="/" className="inline-flex"><Brand /></Link></div>
      <div className="mx-auto mt-20 w-full max-w-sm">
        <h1 className="font-display text-3xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">Flight Analytics workspace</p>
        <form onSubmit={submit} className="mt-8 grid gap-5">
          <div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} /></div>
          <div className="grid gap-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={pending} /></div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <LogIn />}{pending ? "Signing in…" : "Sign in"}</Button>
        </form>
      </div>
    </main>
  );
}