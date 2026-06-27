export interface LogMessage {
  type: 'stdout' | 'stderr' | 'status'
  message: string
  timestamp: Date
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'completed' | 'loading'
