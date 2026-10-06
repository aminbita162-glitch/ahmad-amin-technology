import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Ahmad & Amin Technology 2026",
  description: "The exclusive two-brothers app",
  icons: {
    icon: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#07080c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
