import type { Metadata } from "next";
import { IBM_Plex_Sans_KR } from "next/font/google";
import "./globals.css";

const ibmPlexSansKR = IBM_Plex_Sans_KR({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-sans-kr",
  display: "swap",
});

export const metadata: Metadata = {
  title: "트이다 스튜디오 — 수학 학습 도구",
  description: "트이다 수학학원이 만드는 인터랙티브 수학 학습 도구 모음",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${ibmPlexSansKR.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
