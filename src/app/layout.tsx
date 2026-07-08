import type { Metadata, Viewport } from 'next'
import { Inter, Inter_Tight } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import AppSidebar from '@/components/navigation/app-sidebar'
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
          <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.08),transparent_32rem),#0b0d12] lg:flex">
            <AppSidebar providerRunsEnabled={providerRunsEnabled} />
            <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-screen-2xl">{children}</div>
            </main>
            <Toaster />
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
