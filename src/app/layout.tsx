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
  title: "OOWAPP — Order on WhatsApp",
  description: "Order on WhatsApp",
  applicationName: "OOWAPP",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "OOWAPP",
  },
  openGraph: {
    type: "website",
    title: "OOWAPP — Order on WhatsApp",
    description: "Order on WhatsApp",
    siteName: "OOWAPP",
  },
  twitter: {
    card: "summary",
    title: "OOWAPP — Order on WhatsApp",
    description: "Order on WhatsApp",
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
