export type CSSSelector = string
export type XPathSelector = `/${string}` | `//${string}`
export type SelectorName = string
export type Selector = CSSSelector | XPathSelector
export type Locator = Record<string, Selector>
export type LocatorMap = {
  name: string
  path: string
}

export type LocatorCollection = Record<string, Locator>
