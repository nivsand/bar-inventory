import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { PWARegister } from "@/components/PWARegister";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Bar Inventory",
  description: "Smart Inventory, Ordering & Prep Management",
  manifest: "/manifest.webmanifest",
  applicationName: "Bar Inventory",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Bar Inventory" },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#104edd",
  width: "device-width",
  initialScale: 1,
  // viewport-fit=cover -> respect iPhone safe areas in standalone mode
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const locale = (session?.user as any)?.locale ?? "he";
  const dir = locale === "he" ? "rtl" : "ltr";
  return (
    <html lang={locale} dir={dir}>
      <body>
        <Providers initialLocale={locale}>{children}</Providers>
        <PWARegister />
      </body>
    </html>
  );
}
