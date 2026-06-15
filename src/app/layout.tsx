import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono, Outfit } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-heading",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Blu CRM",
  description:
    "Client and sales pipeline portal for Blu Builders — The Creative Build Company.",
  icons: {
    icon: [
      { url: "/logo-light.png", media: "(prefers-color-scheme: light)" },
      { url: "/logo-dark.png", media: "(prefers-color-scheme: dark)" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={`${outfit.variable} ${dmSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
      lang="en"
      suppressHydrationWarning
    >
      {/* suppressHydrationWarning on body: browser extensions (ColorZilla,
          Grammarly, password managers) inject attributes before React
          hydrates; this only silences attribute mismatches on this element. */}
      <body
        className="flex min-h-full flex-col bg-background text-foreground"
        suppressHydrationWarning
      >
        {/* Polyfill the SWC/esbuild __name helper before any inline script
            runs. next-themes inlines a stringified bootstrap function
            (M.toString()); the `next build --webpack` SWC minifier wraps it
            with __name() but never defines the helper in that inline <script>
            scope, so it threw "__name is not defined", which broke hydration
            and left the sign-in form inert. */}
        <Script id="name-helper-polyfill" strategy="beforeInteractive">
          {"globalThis.__name=globalThis.__name||function(f){return f};"}
        </Script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
