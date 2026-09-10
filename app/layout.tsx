import type { Metadata } from "next";
import "./globals.css";
import "./dashboard-v2.css";
import "./remaster.css";

export const metadata: Metadata = {
  title: "MS Intelligence | TCG + MCD",
  description: "Painel de faturamento, campanhas, lojas, CNPJs, redes e promotores das filiais TCG e MCD em Mato Grosso do Sul.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  other: {
    "codex-preview": "development",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="dark">
      <head><link rel="stylesheet" href="/fonts/fonts.css" /></head>
      <body>{children}</body>
    </html>
  );
}
