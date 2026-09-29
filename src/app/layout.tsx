import type { Metadata, Viewport } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './globals.css';
import { Shell } from '@/components/shell';
import { isConfigured } from '@/lib/supabase/config';
import { currentRole } from '@/lib/access';

export const metadata: Metadata = {
  title: { default: 'OAK Foundation | Partner Convening 2026', template: '%s | OAK Foundation' },
  description:
    'Register, explore the programme and connect with partners at the OAK Foundation Partner Convening, 9–11 November 2026.',
  icons: { icon: '/favicon.svg' },
};

// Lets the mobile header / bottom nav sit correctly under phone status bars and home indicators.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#162e55',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const role = await currentRole();
  return (
    <html lang="en">
      <head>
        {/* Chillax (display font used for headings and buttons in the Figma) — free from Fontshare */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=chillax@500,600,700&display=swap"
        />
      </head>
      <body>
        <Shell demo={!isConfigured()} role={role}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
