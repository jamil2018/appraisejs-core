import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { ModeToggle } from '@/components/theme/mode-toggle'
import { Toaster } from '@/components/ui/toaster'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Appraise',
  description: 'Next generation test case management for professionals',
}

import Logo from '@/components/logo'
import NavLink from '@/components/navigation/nav-link'
import {
  Blocks,
  Bot,
  BrickWall,
  Code,
  Component,
  FileSliders,
  Group,
  LayoutDashboard,
  LayoutTemplate,
  ListChecks,
  Puzzle,
  Settings,
  TestTubeDiagonal,
  TestTubes,
} from 'lucide-react'
import Link from 'next/link'
import NavMenuCardDeck from '@/components/navigation/nav-menu-card-deck'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}>
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
                      description: 'Create, modify, and run test suites',
                    },
                    {
                      text: 'Test Cases',
                      icon: <TestTubeDiagonal className="h-6 w-6 text-primary" />,
                      href: '/test-cases',
                      description: 'Create, modify, and run test cases',
                    },
                    {
                      text: 'Test Runs',
                      icon: <ListChecks className="h-6 w-6 text-primary" />,
                      href: '/test-runs',
                      description: 'Create, modify, and run test runs',
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
                      description: 'Create, modify, and run template steps',
                    },
                    {
                      text: 'Template Step Groups',
                      icon: <Component className="h-6 w-6 text-primary" />,
                      href: '/template-step-groups',
                      description: 'Create, modify, and run template step groups',
                    },
                    {
                      text: 'Template Test Cases',
                      icon: <Blocks className="h-6 w-6 text-primary" />,
                      href: '/template-test-cases',
                      description: 'Create, modify, and run template test cases',
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
                      description: 'Create, modify, and run locators',
                    },
                    {
                      text: 'Locator Groups',
                      icon: <Group className="h-6 w-6 text-primary" />,
                      href: '/locator-groups',
                      description: 'Create, modify, and run locator groups',
                    },
                    {
                      text: 'Modules',
                      icon: <Puzzle className="h-6 w-6 text-primary" />,
                      href: '/modules',
                      description: 'Create, modify, and run modules',
                    },
                  ]}
                />
                <NavLink
                  href="/settings"
                  icon={<Settings className="h-5 w-5 text-primary" />}
                  className="ml-auto"
                  isIconOnly
                />
              </div>
            </nav>

            {children}
            <Toaster />
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
