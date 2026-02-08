import type { Metadata } from 'next'
import { Inter, Inter_Tight } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { ModeToggle } from '@/components/theme/mode-toggle'
import { Toaster } from '@/components/ui/toaster'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
})

const interTight = Inter_Tight({
  variable: '--font-inter-tight',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Appraise | Dashboard',
  description: 'Welcome to the dashboard. Here you can see your test suites and run them.',
}

import Logo from '@/components/logo'
import NavLink from '@/components/navigation/nav-link'
import {
  Blocks,
  Bot,
  BrickWall,
  Code,
  Component,
  FileCheck,
  FileSliders,
  Group,
  LayoutDashboard,
  LayoutTemplate,
  ListChecks,
  Puzzle,
  Server,
  Settings,
  Tag,
  TestTubeDiagonal,
  TestTubes,
} from 'lucide-react'
import Link from 'next/link'
import NavMenuCardDeck from '@/components/navigation/nav-menu-card-deck'
import { DevtoolsProviders } from '@/components/devtools/providers'
import NavCommand from '@/components/navigation/nav-command'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${interTight.variable} min-h-screen antialiased`}>
        <DevtoolsProviders>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <ModeToggle />
            <div className="mx-auto lg:max-w-screen-xl 2xl:max-w-screen-2xl">
              <nav className="mb-6 py-2">
                <div className="flex items-center gap-1">
                  <div className="-ml-2">
                    <Link href="/">
                      <Logo />
                    </Link>
                  </div>
                  <NavLink href="/" icon={<LayoutDashboard className="h-5 w-5 text-primary" />}>
                    Dashboard
                  </NavLink>
                  <NavMenuCardDeck
                    containerButtonText="Automate"
                    containerButtonIcon={<Bot className="h-5 w-5 text-primary" />}
                    dropdownItems={[
                      {
                        text: 'Test Suites',
                        icon: <TestTubes className="h-6 w-6 text-primary" />,
                        href: '/test-suites',
                        description: 'Group tests into logical units',
                      },
                      {
                        text: 'Test Cases',
                        icon: <TestTubeDiagonal className="h-6 w-6 text-primary" />,
                        href: '/test-cases',
                        description: 'Define test scenarios',
                      },
                      {
                        text: 'Test Runs',
                        icon: <ListChecks className="h-6 w-6 text-primary" />,
                        href: '/test-runs',
                        description: 'Execute test scenarios',
                      },
                      {
                        text: 'Reports',
                        icon: <FileCheck className="h-6 w-6 text-primary" />,
                        href: '/reports',
                        description: 'Analyze test results',
                      },
                    ]}
                  />
                  <NavMenuCardDeck
                    containerButtonText="Template"
                    containerButtonIcon={<BrickWall className="h-5 w-5 text-primary" />}
                    dropdownItems={[
                      {
                        text: 'Template Steps',
                        icon: <LayoutTemplate className="h-6 w-6 text-primary" />,
                        href: '/template-steps',
                        description: 'Define reusable test steps',
                      },
                      {
                        text: 'Template Step Groups',
                        icon: <Component className="h-6 w-6 text-primary" />,
                        href: '/template-step-groups',
                        description: 'Organize template steps into logical groups',
                      },
                      {
                        text: 'Template Test Cases',
                        icon: <Blocks className="h-6 w-6 text-primary" />,
                        href: '/template-test-cases',
                        description: 'Define reusable test scenario templates',
                      },
                    ]}
                  />
                  <NavMenuCardDeck
                    containerButtonText="Configuration"
                    containerButtonIcon={<FileSliders className="h-5 w-5 text-primary" />}
                    dropdownItems={[
                      {
                        text: 'Locators',
                        icon: <Code className="h-6 w-6 text-primary" />,
                        href: '/locators',
                        description: 'Define reusable locators',
                      },
                      {
                        text: 'Locator Groups',
                        icon: <Group className="h-6 w-6 text-primary" />,
                        href: '/locator-groups',
                        description: 'Organize locators into logical groups',
                      },
                      {
                        text: 'Modules',
                        icon: <Puzzle className="h-6 w-6 text-primary" />,
                        href: '/modules',
                        description: 'Organize tests into logical units',
                      },
                      {
                        text: 'Environments',
                        icon: <Server className="h-6 w-6 text-primary" />,
                        href: '/environments',
                        description: 'Define test environment configurations',
                      },
                      {
                        text: 'Tags',
                        icon: <Tag className="h-6 w-6 text-primary" />,
                        href: '/tags',
                        description: 'Define tags for test scenarios and suites',
                      },
                    ]}
                  />
                  <NavCommand className="ml-auto" />
                </div>
              </nav>
              {children}
              <Toaster />
            </div>
          </ThemeProvider>
        </DevtoolsProviders>
      </body>
    </html>
  )
}
