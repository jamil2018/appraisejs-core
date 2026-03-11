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

/**
 * Parses formatted log text back into an array of LogEntry objects
 * 
 * @param formattedLogs - Formatted log string from database
 * @returns Array of log entries
 */
export function parseLogsFromStorage(formattedLogs: string): LogEntry[] {
  if (!formattedLogs || formattedLogs.trim() === '') {
    return []
  }

  const lines = formattedLogs.split('\n')
  const parsedLogs: LogEntry[] = []

  for (const line of lines) {
    if (!line.trim()) continue

    try {
      // Match format: [timestamp] [TYPE] message
      const match = line.match(/^\[([^\]]+)\] \[([^\]]+)\] (.+)$/)
      
      if (match) {
        const [, timestampStr, typeStr, message] = match
        const timestamp = new Date(timestampStr)
        const type = typeStr.toLowerCase() as 'stdout' | 'stderr' | 'status'
        
        // Unescape newlines in message
        const unescapedMessage = message.replace(/\\n/g, '\n')
        
        // Validate type
        if (type === 'stdout' || type === 'stderr' || type === 'status') {
          parsedLogs.push({
            type,
            message: unescapedMessage,
            timestamp: isNaN(timestamp.getTime()) ? new Date() : timestamp,
          })
        }
      } else {
        // Fallback: treat as stdout if format doesn't match
        parsedLogs.push({
          type: 'stdout',
          message: line,
          timestamp: new Date(),
        })
      }
    } catch (error) {
      // Skip malformed lines
      console.error('[LogFormatter] Error parsing log line:', line, error)
    }
  }

  return parsedLogs
}

