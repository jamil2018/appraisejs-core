import winston from 'winston'
import path from 'path'
import { promises as fs } from 'fs'

const LOGS_DIR = path.join(process.cwd(), 'src', 'tests', 'reports', 'logs')

/**
 * Ensures the logs directory exists, creating it if necessary
 */
async function ensureLogsDirectory(): Promise<void> {
  try {
    await fs.access(LOGS_DIR)
  } catch {
    // Directory doesn't exist, create it
    await fs.mkdir(LOGS_DIR, { recursive: true })
  }
}

/**
 * Creates a Winston logger instance for a specific test run
 * @param testRunId - The unique test run ID (runId, not id)
 * @returns A configured Winston logger instance
 */
export async function createTestRunLogger(testRunId: string): Promise<winston.Logger> {
  // Ensure logs directory exists
  await ensureLogsDirectory()

  // Create log file path
  const logFilePath = path.join(LOGS_DIR, `${testRunId}.log`)

  // Define log format
  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      if (stack) {
        return `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`
      }
      return `${timestamp} [${level.toUpperCase()}]: ${message}`
    }),
  )

  // Create logger with console and file transports
  const logger = winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: [
      // Console transport (stdout)
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, stack }) => {
            if (stack) {
              return `${timestamp} [${level}]: ${message}\n${stack}`
            }
            return `${timestamp} [${level}]: ${message}`
          }),
        ),
      }),
      // File transport
      new winston.transports.File({
        filename: logFilePath,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
      }),
    ],
  })

  return logger
}

/**
 * Closes a Winston logger instance, ensuring all logs are flushed
 * @param logger - The logger instance to close
 */
export async function closeLogger(logger: winston.Logger): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.end((err: Error | null) => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

/**
 * Gets the log file path for a test run
 * @param testRunId - The unique test run ID (runId, not id)
 * @returns The absolute path to the log file
 */
export function getLogFilePath(testRunId: string): string {
  return path.join(LOGS_DIR, `${testRunId}.log`)
}
