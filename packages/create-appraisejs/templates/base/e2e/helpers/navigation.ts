import { expect, type Page } from '@playwright/test'

import { expectPageHeading } from './ui'

export type RouteExpectation = {
  path: string
  heading: string | RegExp
}

export async function gotoAndExpectHeading(page: Page, path: string, heading: string | RegExp): Promise<void> {
  await page.goto(path)
  await expectPageHeading(page, heading)
}

export async function visitRoutes(page: Page, routes: RouteExpectation[]): Promise<void> {
  for (const route of routes) {
    await gotoAndExpectHeading(page, route.path, route.heading)
  }
}

export function buildModifyPath(basePath: string, id: string): string {
  return `${basePath}/modify/${id}`
}

export async function expectUrl(page: Page, urlPattern: string | RegExp): Promise<void> {
  await expect(page).toHaveURL(urlPattern)
}
