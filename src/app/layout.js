import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Bitfinex Terminal - Real-Time Trading Dashboard & Analytics",
  description: "Professional trading terminal for Bitfinex exchange. Real-time market scanner, liquidity risk monitoring, hot wallet flows, funding rates, and derivatives open interest. Track 24H/7D/30D volumes, spreads, and token balances with live updates.",
  keywords: [
    "Bitfinex",
    "trading terminal",
    "cryptocurrency exchange",
    "market scanner",
    "liquidity risk",
    "funding rates",
    "open interest",
    "derivatives",
    "hot wallet",
    "trading dashboard",
    "crypto analytics",
    "real-time trading",
    "Bitfinex API",
    "trading pairs",
    "volume analysis"
  ],
  authors: [{ name: "Bitfinex Terminal" }],
  creator: "Bitfinex Terminal",
  publisher: "Bitfinex Terminal",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://bfxterminal.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: "Bitfinex Terminal - Real-Time Trading Dashboard & Analytics",
    description: "Professional trading terminal for Bitfinex exchange. Real-time market scanner, liquidity risk monitoring, hot wallet flows, funding rates, and derivatives open interest. Track 24H/7D/30D volumes, spreads, and token balances with live updates.",
    url: process.env.NEXT_PUBLIC_SITE_URL || 'https://bfxterminal.com',
    siteName: "Bitfinex Terminal",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'Bitfinex Terminal - Real-Time Trading Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Bitfinex Terminal - Real-Time Trading Dashboard",
    description: "Professional trading terminal for Bitfinex. Real-time market scanner, liquidity risk monitoring, hot wallet flows, and funding rates.",
    images: ['/opengraph-image.png'],
    creator: '@bitfinex',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    // Add verification codes if you have them
    // google: 'your-google-verification-code',
    // yandex: 'your-yandex-verification-code',
    // bing: 'your-bing-verification-code',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <meta name="theme-color" content="#0d1117" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
      </head>
      <body className={inter.className}>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
