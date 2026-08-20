/**
 * Log formatting utilities for storing and retrieving test run logs
 */

export interface LogEntry {
  type: 'stdout' | 'stderr' | 'status'
  message: string
  timestamp: Date
}

/**
 * Formats log entries into a single text string for storage in the database
 * Format: [timestamp] [TYPE] message
 *
 * @param logs - Array of log entries to format
 * @returns Formatted log string
 */
export function formatLogsForStorage(logs: LogEntry[]): string {
  return logs
    .map(log => {
      const timestamp = log.timestamp.toISOString()
      const type = log.type.toUpperCase()
      // Escape newlines in message to preserve them in the formatted string
      const escapedMessage = log.message.replace(/\n/g, '\\n')
      return `[${timestamp}] [${type}] ${escapedMessage}`
    })
    .join('\n')
}
