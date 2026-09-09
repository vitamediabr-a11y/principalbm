import type { Metadata, Viewport } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: { default: "Principal BM", template: "%s · Principal BM" },
  description: "Inteligência de relacionamento e jornada do cliente.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
