import type { Metadata, Viewport } from 'next'
import { Inter, Inter_Tight } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import AppSidebar from '@/components/navigation/app-sidebar'
import MobileNavigation from '@/components/navigation/mobile-navigation'
import { isProviderNativeRunsEnabled } from '@/lib/feature-flags'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
})

const interTight = Inter_Tight({
  variable: '--font-inter-tight',
  subsets: ['latin'],
})

const appTitle = 'AppraiseJS'
const appDescription =
  'AppraiseJS helps teams organize automated tests, execute suites, and review results from one dashboard.'

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#09090b',
}

export const metadata: Metadata = {
  title: {
    default: appTitle,
    template: `%s | ${appTitle}`,
  },
  description: appDescription,
  applicationName: appTitle,
  keywords: ['AppraiseJS', 'test automation', 'QA', 'dashboard', 'test execution'],
  openGraph: {
    title: appTitle,
    description: appDescription,
    siteName: appTitle,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: appTitle,
    description: appDescription,
  },
  appleWebApp: {
    capable: true,
    title: appTitle,
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    shortcut: ['/favicon.svg'],
    other: [{ rel: 'mask-icon', url: '/favicon.svg', color: '#5cb85c' }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const providerRunsEnabled = isProviderNativeRunsEnabled()

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${interTight.variable} min-h-screen antialiased`}>
        <ThemeProvider>
          <div className="min-h-screen bg-[#0b0f17] lg:flex">
            <a
              href="#main-content"
              className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
            >
              Skip to main content
            </a>
            <AppSidebar providerRunsEnabled={providerRunsEnabled} />
            <div className="fixed inset-x-0 top-0 z-40 lg:hidden">
              <MobileNavigation providerRunsEnabled={providerRunsEnabled} />
            </div>
            <main
              id="main-content"
              tabIndex={-1}
              className="relative min-w-0 flex-1 scroll-mt-4 overflow-hidden px-4 pb-5 pt-16 focus:outline-none sm:px-6 sm:pt-16 lg:px-8 lg:py-5"
            >
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_5%,rgba(38,83,121,0.22),transparent_25rem),radial-gradient(circle_at_78%_10%,rgba(45,212,191,0.055),transparent_30rem),linear-gradient(135deg,rgba(18,37,64,0.24),rgba(11,15,23,0.78)_42%,rgba(8,11,17,0.92))]"
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
                aria-hidden="true"
              />
              <div className="relative mx-auto max-w-screen-2xl">{children}</div>
            </main>
            <Toaster />
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
