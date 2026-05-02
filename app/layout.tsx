import type { Metadata } from "next";
import { Cinzel, Montserrat, Parisienne } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
});

const parisienne = Parisienne({
  variable: "--font-parisienne",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "SAIA Nominations Frontend",
  description: "Frontend-only nominations and referee workflow prototype",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${montserrat.variable} ${cinzel.variable} ${parisienne.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
