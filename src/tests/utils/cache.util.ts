import { readFileSync } from 'fs'
import { globSync } from 'glob'
import { LocatorCollection, LocatorMap } from '../../types/locator/locator.type'
import * as path from 'path'

export class LocatorCache {
  private static instance: LocatorCache
  private data: Record<string, LocatorCollection> = {}
  private filePaths: Record<string, string> = {}
  private loadedFiles: Set<string> = new Set()

  private constructor() {
    globSync(`${process.env.LOCATOR_LOCATION ?? 'src/locators'}/**/*.json`).forEach(file => {
      const fileName = path.basename(file, path.extname(file))
      this.filePaths[fileName ?? file] = file
    })
  }

  public static getInstance(): LocatorCache {
    if (!LocatorCache.instance) {
      LocatorCache.instance = new LocatorCache()
    }
    return LocatorCache.instance
  }

  public get(key: string) {
    // Lazy load the file if not already loaded
    if (!this.loadedFiles.has(key) && this.filePaths[key]) {
      try {
        const filePath = this.filePaths[key]
        const data = JSON.parse(readFileSync(filePath, 'utf8'))
        this.data[key] = data as LocatorCollection
        this.loadedFiles.add(key)
      } catch (error) {
        console.error(`Error loading locator file for key "${key}":`, error)
        return null
      }
    }

    return this.data[key] ? { ...this.data[key] } : null
  }

  /**
   * Preload all locator files at once
   * Useful when you want to ensure all files are loaded upfront
   */
  public preloadAll(): void {
    Object.keys(this.filePaths).forEach(key => {
      if (!this.loadedFiles.has(key)) {
        this.get(key) // This will trigger lazy loading
      }
    })
  }

  /**
   * Get all available locator keys without loading the files
   */
  public getAvailableKeys(): string[] {
    return Object.keys(this.filePaths)
  }

  /**
   * Check if a specific locator file is loaded
   */
  public isLoaded(key: string): boolean {
    return this.loadedFiles.has(key)
  }
}

export class LocatorMapCache {
  private static instance: LocatorMapCache
  private data: LocatorMap[] = []

  private constructor() {
    this.data = JSON.parse(readFileSync(process.env.LOCATOR_MAP_LOCATION ?? 'src/mapping/locator-map.json', 'utf8'))
  }

  public static getInstance(): LocatorMapCache {
    if (!LocatorMapCache.instance) {
      LocatorMapCache.instance = new LocatorMapCache()
    }
    return LocatorMapCache.instance
  }

  public get(key: string): LocatorMap {
    try {
      return this.data.find(map => map.path === key) as LocatorMap
    } catch (error) {
      console.error(error)
      return {
        name: '',
        path: '',
      }
    }
  }

  public getAll(): LocatorMap[] {
    return this.data
  }
}
