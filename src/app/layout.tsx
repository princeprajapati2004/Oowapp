import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/shared/pwa-register";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Oowapp — Business Operating System for Local Businesses",
    template: "%s | Oowapp",
  },
  description:
    "Oowapp helps local businesses take orders, accept UPI payments, generate bills, and manage operations — all from one simple platform.",
  applicationName: "Oowapp",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Oowapp",
  },
  openGraph: {
    type: "website",
    title: "Oowapp — Business Operating System for Local Businesses",
    description:
      "Take orders, accept payments, generate bills, and manage your business — all in one place.",
    siteName: "Oowapp",
  },
  twitter: {
    card: "summary_large_image",
    title: "Oowapp — Business Operating System for Local Businesses",
    description:
      "Take orders, accept payments, generate bills, and manage your business — all in one place.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a1a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            {children}
            <Toaster position="top-center" richColors />
          </TooltipProvider>
        </ThemeProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
