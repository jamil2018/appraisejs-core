import { promises as fs } from 'node:fs'
import path from 'node:path'

export async function findProjectRoot(startDirectory = process.cwd()): Promise<string> {
  let current = path.resolve(startDirectory)

  while (true) {
    try {
      await fs.access(path.join(current, 'package.json'))
      return current
    } catch {
      const parent = path.dirname(current)
      if (parent === current) {
        throw new Error(`Unable to find an AppraiseJS project root from ${startDirectory}`)
      }
      current = parent
    }
  }
}
