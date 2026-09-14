import { NextResponse } from "next/server";
import { encryptPayload } from "@/lib/crypto-server";

// Registration payloads are encrypted server-side, not client-side - the
// backend decrypts with ENCRYPTION_KEY (backend/.env), and this route
// encrypts with the same key read from frontend/.env.local's own
// (non-public) ENCRYPTION_KEY. Never NEXT_PUBLIC_ENCRYPTION_KEY here: that
// var is readable by the browser, and shipping the encryption key to the
// client defeats the point of encrypting at all.
export async function POST(request: Request) {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  const payload = await request.json();
  const encrypted = encryptPayload(payload);

  const res = await fetch(`${backendUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ encrypted }),
  });

  const data = await res.json().catch(() => null);
  return NextResponse.json(data, { status: res.status });
}
