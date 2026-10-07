import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Amazon AI Autopilot",
  description:
    "AI-powered Amazon seller intelligence and advertising optimization platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}