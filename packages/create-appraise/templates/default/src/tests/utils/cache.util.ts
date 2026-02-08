import { readFileSync } from 'fs'
import { globSync } from 'glob'
import { LocatorCollection, LocatorMap } from '@/types/locator/locator.type'
import * as path from 'path'

/**
 * Singleton cache for managing Playwright locator collections
 *
 * This class provides a lazy-loading cache for locator JSON files. It automatically
 * discovers all locator files in the configured directory and loads them on-demand
 * to optimize memory usage and startup time.
 *
 * Features:
 * - Singleton pattern ensures single instance across the application
 * - Lazy loading of locator files for better performance
 * - Automatic file discovery using glob patterns
 * - Error handling for malformed JSON files
 * - Memory-efficient with optional preloading
 */
export class LocatorCache {
  /** Singleton instance of the LocatorCache */
  private static instance: LocatorCache

  /** In-memory cache of loaded locator collections, keyed by file name */
  private data: Record<string, LocatorCollection> = {}

  /** Map of file names to their full file paths */
  private filePaths: Record<string, string> = {}

  /** Set of file names that have been loaded into memory */
  private loadedFiles: Set<string> = new Set()

  /**
   * Private constructor for singleton pattern
   *
   * Automatically discovers all JSON files in the locator directory and
   * maps them by their base filename for easy lookup.
   *
   * @private
   */
  private constructor() {
    globSync(`${process.env.LOCATOR_LOCATION ?? 'src/tests/locators'}/**/*.json`).forEach(file => {
      const fileName = path.basename(file, path.extname(file))
      this.filePaths[fileName ?? file] = file
    })
  }

  /**
   * Gets the singleton instance of LocatorCache
   *
   * Creates a new instance if one doesn't exist, otherwise returns the existing instance.
   *
   * @returns The singleton LocatorCache instance
   *
   * @example
   * ```typescript
   * const cache = LocatorCache.getInstance();
   * const locators = cache.get('home');
   * ```
   */
  public static getInstance(): LocatorCache {
    if (!LocatorCache.instance) {
      LocatorCache.instance = new LocatorCache()
    }
    return LocatorCache.instance
  }

  /**
   * Retrieves a locator collection by key (filename without extension)
   *
   * Performs lazy loading - the file is only loaded from disk when first requested.
   * Returns a shallow copy of the data to prevent external modifications.
   *
   * @param key - The filename (without .json extension) of the locator file
   * @returns A shallow copy of the LocatorCollection, or null if not found or error
   *
   * @example
   * ```typescript
   * const homeLocators = cache.get('home');
   * if (homeLocators) {
   *   console.log(homeLocators.loginButton); // '#login-btn'
   * }
   * ```
   */
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
   * Preloads all locator files into memory at once
   *
   * This method loads all discovered locator files into memory, which can be
   * useful for ensuring all files are available upfront or for performance
   * optimization when you know all locators will be needed.
   *
   * @example
   * ```typescript
   * const cache = LocatorCache.getInstance();
   * cache.preloadAll(); // Load all locator files now
   * ```
   */
  public preloadAll(): void {
    Object.keys(this.filePaths).forEach(key => {
      if (!this.loadedFiles.has(key)) {
        this.get(key) // This will trigger lazy loading
      }
    })
  }

  /**
   * Gets all available locator file keys without loading the files
   *
   * Returns the list of all discovered locator file names (without extensions)
   * that are available for loading. This is useful for listing available
   * locator collections or for validation purposes.
   *
   * @returns Array of available locator file names
   *
   * @example
   * ```typescript
   * const cache = LocatorCache.getInstance();
   * const availableKeys = cache.getAvailableKeys();
   * console.log('Available locators:', availableKeys); // ['home', 'login', 'dashboard']
   * ```
   */
  public getAvailableKeys(): string[] {
    return Object.keys(this.filePaths)
  }

  /**
   * Checks if a specific locator file has been loaded into memory
   *
   * @param key - The filename (without .json extension) to check
   * @returns True if the file is loaded in memory, false otherwise
   *
   * @example
   * ```typescript
   * const cache = LocatorCache.getInstance();
   * if (!cache.isLoaded('home')) {
   *   console.log('Home locators not yet loaded');
   * }
   * ```
   */
  public isLoaded(key: string): boolean {
    return this.loadedFiles.has(key)
  }
}

/**
 * Singleton cache for managing locator path mappings
 *
 * This class provides a cache for the locator mapping configuration that
 * maps URL paths to their corresponding locator collection names. It loads
 * the mapping file once at initialization and provides fast lookups.
 *
 * Features:
 * - Singleton pattern ensures single instance across the application
 * - Loads mapping configuration at initialization
 * - Provides fast path-to-locator-name lookups
 * - Error handling for malformed mapping files
 */
export class LocatorMapCache {
  /** Singleton instance of the LocatorMapCache */
  private static instance: LocatorMapCache

  /** Array of locator mappings loaded from the configuration file */
  private data: LocatorMap[] = []

  /**
   * Private constructor for singleton pattern
   *
   * Loads the locator mapping configuration file at initialization.
   * The mapping file contains path-to-locator-name mappings.
   *
   * @private
   */
  private constructor() {
    this.data = JSON.parse(
      readFileSync(process.env.LOCATOR_MAP_LOCATION ?? 'src/tests/mapping/locator-map.json', 'utf8'),
    )
  }

  /**
   * Gets the singleton instance of LocatorMapCache
   *
   * Creates a new instance if one doesn't exist, otherwise returns the existing instance.
   *
   * @returns The singleton LocatorMapCache instance
   *
   * @example
   * ```typescript
   * const mapCache = LocatorMapCache.getInstance();
   * const mapping = mapCache.get('/login');
   * ```
   */
  public static getInstance(): LocatorMapCache {
    if (!LocatorMapCache.instance) {
      LocatorMapCache.instance = new LocatorMapCache()
    }
    return LocatorMapCache.instance
  }

  /**
   * Retrieves a locator mapping by URL path
   *
   * Searches through the loaded mappings to find the one that matches the given path.
   * Returns a default empty mapping if not found or on error.
   *
   * @param key - The URL path to look up (e.g., '/login', '/dashboard')
   * @returns The LocatorMap object containing the path and corresponding locator name
   *
   * @example
   * ```typescript
   * const mapping = mapCache.get('/login');
   * console.log(mapping.name); // 'login'
   * console.log(mapping.path); // '/login'
   * ```
   */
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

  /**
   * Retrieves all locator mappings
   *
   * @returns Array of all LocatorMap objects
   *
   * @example
   * ```typescript
   * const allMappings = mapCache.getAll();
   * allMappings.forEach(mapping => {
   *   console.log(`${mapping.path} -> ${mapping.name}`);
   * });
   * ```
   */
  public getAll(): LocatorMap[] {
    return this.data
  }
}
