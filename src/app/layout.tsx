import type { Metadata } from "next";
import { Hanken_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteNav, type NavUser } from "@/components/layout/site-nav";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { getSessionProfile } from "@/lib/auth";

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "UbSE-Study",
  description: "UbSE 스터디 운영 사이트 — 출석, 시험, 게시판, 랭킹",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { profile } = await getSessionProfile();
  const navUser: NavUser = profile
    ? {
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        role: profile.role,
        status: profile.status,
      }
    : null;

  return (
    <html
      lang="ko"
      className={`${hankenGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <SiteNav user={navUser} />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
