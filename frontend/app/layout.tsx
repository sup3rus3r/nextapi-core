import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "./providers";

// One monospace typeface everywhere (headings, body, code) - a deliberate
// NextAPI brand choice matching the "engineering tool" positioning, not a
// missing sans/mono pairing. See ../../brand/COLORS.md.
//
// Loaded from the `geist` package (local font files bundled in
// node_modules) rather than next/font/google's Geist_Mono, which fetches
// font metadata from Google's CDN at build/dev time - that network call
// failing reproduced this exact crash on every single fresh clone/install:
// "Module not found: Can't resolve
// '@vercel/turbopack-next/internal/font/google/font'". geist/font/mono
// exports the identical font (same family, same default CSS variable name,
// --font-geist-mono) with zero network dependency, so this is a drop-in
// swap - see https://github.com/vercel/geist-font.

export const metadata: Metadata = {
  title: "NextAPI",
  description: "The open-source FastAPI + Next.js starter, wired into the NextAPI module registry.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${GeistMono.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
