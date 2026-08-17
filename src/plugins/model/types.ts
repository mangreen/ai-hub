/** Shared request/response shapes across every ModelProvider — see ADR-0003. */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionResult {
  content: string
  /** The provider's own name for the model that actually answered — not necessarily identical to the requested model string. */
  model: string
}
