import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BotIdClient } from "botid/client";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "CYON Payments", template: "%s · CYON Payments" },
  description: "Pay CYON dues, levies and contributions, and keep a clear record with receipts.",
};

/** Public payment-link submissions are verified with Vercel BotID. */
const botProtected = [{ path: "/p/*", method: "POST" as const }];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NG" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <BotIdClient protect={botProtected} />
      </head>
      {/* Browser extensions (e.g. Grammarly) inject attributes on <body> before hydration. */}
      <body className="min-h-full font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
