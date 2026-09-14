"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { Eye, EyeOff, AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STRENGTH_LABELS = ["Weak", "Fair", "Good", "Strong"];
const STRENGTH_COLORS = ["bg-red-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"];

function getPasswordStrength(password: string) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/backend/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Registration failed");
      }

      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_50%_0%,color-mix(in_oklch,var(--brand)_12%,transparent),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[32px_32px] mask-[radial-gradient(ellipse_60%_60%_at_50%_0%,black,transparent)]" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/">
            <Logo markClassName="size-10" />
          </Link>
        </div>

        <Card className="shadow-xl shadow-black/5 dark:shadow-black/20">
          <CardContent className="px-8">
            <div className="mb-6 text-center">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Create an account</h1>
              <p className="mt-1 text-sm text-muted-foreground">Sign up to get started</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  type="text"
                  id="username"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Choose a username"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  type="email"
                  id="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    name="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a password"
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {password && (
                  <div className="pt-1">
                    <div className="flex gap-1.5">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <span
                          key={i}
                          className={cn(
                            "h-1.5 flex-1 rounded-full bg-muted transition-colors",
                            i < strength && STRENGTH_COLORS[strength - 1]
                          )}
                        />
                      ))}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {strength >= 3 ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {strength > 0 ? STRENGTH_LABELS[strength - 1] : "Too short"} -use 8+ characters with a mix of letters, numbers &amp; symbols
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="h-10 w-full cursor-pointer bg-brand text-brand-foreground hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/40 border-t-current" />
                    Creating account...
                  </span>
                ) : (
                  "Register"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a href="/login" className="font-semibold text-foreground transition-colors hover:text-brand">
            Login
          </a>
        </p>
      </div>
    </div>
  );
}
