import type { Metadata, Viewport } from 'next'
import { Inter, Inter_Tight } from 'next/font/google'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import './globals.css'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import AppSidebar from '@/components/navigation/app-sidebar'
import MobileNavigation from '@/components/navigation/mobile-navigation'
import { isProviderNativeRunsEnabled } from '@/lib/feature-flags'
import { readActiveProjectCookie } from '@/lib/active-project'
import { listTargetProjects } from '@/services/target-project/target-project-service'
import ProjectRequiredEmptyState from '@/components/data-state/project-required-empty-state'
import { APPRAISE_REQUEST_TARGET_HEADER, isProjectScopedPath, staleProjectScopeReturnTo } from '@/lib/project-scope'

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
    other: [{ rel: 'mask-icon', url: '/favicon.svg', color: '#22d3a6' }],
  },
}

function redirectInvalidProjectScope(input: {
  requestTarget: string
  registeredProjectIds: ReadonlySet<string>
  cookieProjectId?: string | null
}) {
  const returnTo = staleProjectScopeReturnTo(input)
  if (returnTo) redirect(`/api/internal/project-scope/clear?returnTo=${encodeURIComponent(returnTo)}`)
}

function ProjectScopedContent({
  hasProjects,
  requiresProject,
  children,
}: {
  hasProjects: boolean
  requiresProject: boolean
  children: React.ReactNode
}) {
  return !hasProjects && requiresProject ? <ProjectRequiredEmptyState /> : children
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const providerRunsEnabled = isProviderNativeRunsEnabled()
  const [projects, cookieProjectId, requestHeaders] = await Promise.all([
    listTargetProjects(),
    readActiveProjectCookie(),
    headers(),
  ])
  const projectOptions = projects.map(project => ({
    id: project.id,
    displayName: project.displayName,
    canonicalPath: project.canonicalPath ?? project.normalizedRemoteOrigin ?? project.canonicalIdentity,
  }))
  const requiresProject = isProjectScopedPath(requestHeaders.get('x-appraise-pathname') ?? '/')
  const registeredProjectIds = new Set(projectOptions.map(project => project.id))
  redirectInvalidProjectScope({
    requestTarget: requestHeaders.get(APPRAISE_REQUEST_TARGET_HEADER) ?? '/',
    registeredProjectIds,
    cookieProjectId,
  })

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${interTight.variable} min-h-screen antialiased`}>
        <ThemeProvider>
          <div className="min-h-screen bg-[linear-gradient(180deg,rgba(38,83,121,0.34)_0%,rgba(18,37,64,0.27)_34%,rgba(13,20,34,0.46)_100%),#0b0f17] lg:flex lg:pr-2">
            <a
              href="#main-content"
              className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
            >
              Skip to main content
            </a>
            <AppSidebar
              providerRunsEnabled={providerRunsEnabled}
              projects={projectOptions}
              cookieProjectId={cookieProjectId}
            />
            <div className="fixed inset-x-0 top-0 z-40 lg:hidden">
              <MobileNavigation
                providerRunsEnabled={providerRunsEnabled}
                projects={projectOptions}
                cookieProjectId={cookieProjectId}
              />
            </div>
            <main
              id="main-content"
              tabIndex={-1}
              className="relative min-w-0 flex-1 scroll-mt-4 overflow-hidden bg-[#0b0f17] px-4 pb-5 pt-16 focus:outline-none sm:px-6 sm:pt-16 lg:my-2 lg:min-h-[calc(100dvh-1rem)] lg:rounded-xl lg:border lg:border-white/[0.08] lg:bg-[rgba(13,20,34,0.76)] lg:px-8 lg:py-5 lg:shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_24px_60px_-42px_rgba(0,0,0,0.95)] lg:backdrop-blur-xl supports-[not(backdrop-filter:blur(1px))]:lg:bg-[#0d1522]"
            >
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_5%,rgba(38,83,121,0.1),transparent_28rem),linear-gradient(145deg,rgba(18,37,64,0.14),rgba(11,15,23,0.68)_46%,rgba(8,11,17,0.82))]"
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.09] to-transparent"
                aria-hidden="true"
              />
              <div className="relative mx-auto max-w-screen-2xl">
                <ProjectScopedContent hasProjects={projects.length > 0} requiresProject={requiresProject}>
                  {children}
                </ProjectScopedContent>
              </div>
            </main>
            <Toaster />
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
