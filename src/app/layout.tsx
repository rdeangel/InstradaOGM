
import type { Metadata, Viewport } from 'next';

import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/layout/Providers";
import { UIConfigProvider } from "@/context/UIConfigContext";
import { getUIConfig } from "@/lib/server/ui-config";

export const metadata: Metadata = {
  title: 'InstradaOGM',
  description: 'Manage OPNsense Network Groups with ease.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// Force dynamic rendering to ensure SSR runs in Docker containers
export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch initial UI config server-side to prevent loading delays
  const initialUIConfig = await getUIConfig();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {process.env.NODE_ENV === "development" && (
          // eslint-disable-next-line @next/next/no-sync-scripts
          <script src="/react-grab.js" />
        )}
        <link rel="icon" href="/favicon.svg" sizes="any" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Suppress Authentik console messages
              (function() {
                const originalLog = console.log;
                const originalWarn = console.warn;
                const originalError = console.error;
                const originalInfo = console.info;
                const originalDebug = console.debug;

                const shouldSuppress = (args) => {
                  // Convert all arguments to strings and check
                  const message = args.map(arg => {
                    if (typeof arg === 'string') return arg;
                    if (arg && typeof arg === 'object') {
                      try {
                        return JSON.stringify(arg);
                      } catch (e) {
                        return String(arg);
                      }
                    }
                    return String(arg);
                  }).join(' ');

                  // Check for Authentik-specific patterns
                  return message.includes('authentik/stages/redirect') ||
                         message.includes('authentik/ws:') ||
                         message.includes('wss://') && message.includes('/ws/client');
                };

                console.log = function(...args) {
                  if (!shouldSuppress(args)) {
                    originalLog.apply(console, args);
                  }
                };

                console.warn = function(...args) {
                  if (!shouldSuppress(args)) {
                    originalWarn.apply(console, args);
                  }
                };

                console.error = function(...args) {
                  if (!shouldSuppress(args)) {
                    originalError.apply(console, args);
                  }
                };

                console.info = function(...args) {
                  if (!shouldSuppress(args)) {
                    originalInfo.apply(console, args);
                  }
                };

                console.debug = function(...args) {
                  if (!shouldSuppress(args)) {
                    originalDebug.apply(console, args);
                  }
                };
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased flex flex-col min-h-screen">
        <Providers
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <UIConfigProvider initialConfig={initialUIConfig}>
            {children}
          </UIConfigProvider>
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
