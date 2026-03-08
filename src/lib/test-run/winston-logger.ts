import winston from 'winston'
import path from 'path'
import { promises as fs } from 'fs'
import { ensureAutomationWorkspaceReady, getAutomationReportLogsDir } from '@/lib/automation/paths'

const LOGS_DIR = getAutomationReportLogsDir()

async function ensureLogsDirectory(): Promise<void> {
  await ensureAutomationWorkspaceReady()
  await fs.mkdir(LOGS_DIR, { recursive: true })
}

export async function createTestRunLogger(testRunId: string): Promise<winston.Logger> {
  await ensureLogsDirectory()
  const logFilePath = path.join(LOGS_DIR, `${testRunId}.log`)

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

  return winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: [
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
      new winston.transports.File({
        filename: logFilePath,
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5,
      }),
    ],
  })
}

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

export function getLogFilePath(testRunId: string): string {
  return path.join(LOGS_DIR, `${testRunId}.log`)
}
