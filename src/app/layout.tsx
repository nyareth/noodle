import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import { env } from "@/lib/env";

export function generateMetadata(): Metadata {
  return { title: { default: env.siteName, template: `%s | ${env.siteName}` } };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="moodle">{children}</body>
    </html>
  );
}
