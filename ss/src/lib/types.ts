export type DebugFileKind = "request" | "response";

export interface ParsedFileName {
  kind: DebugFileKind;
  fileTimestamp: string;
  requestId: string;
}

export interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: string;
  raw?: string;
}

export interface LlmRequestPayload {
  system?: string;
  messages?: unknown[];
  tools?: unknown[];
}

export interface LlmResponsePayload {
  model?: string;
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  content?: ContentBlock[];
}

export interface RequestDebugJson {
  timestamp?: string;
  caller?: string;
  llm_request?: LlmRequestPayload;
  stats?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface ResponseDebugJson {
  timestamp?: string;
  caller?: string;
  request_id?: string;
  llm_response?: LlmResponsePayload;
  context?: Record<string, unknown>;
}

export interface LoadedDebugFile {
  fileName: string;
  kind: DebugFileKind;
  requestId: string;
  fileTimestamp: string;
  timestamp: string;
  raw: RequestDebugJson | ResponseDebugJson;
  parseError?: string;
}

export interface DebugCallEntry {
  id: string;
  requestId: string;
  sortTimestamp: string;
  displayTime: string;
  caller: string;
  requestFileName?: string;
  responseFileName?: string;
  request?: RequestDebugJson;
  response?: ResponseDebugJson;
  hasRequest: boolean;
  hasResponse: boolean;
}

export interface ParseResult {
  entries: DebugCallEntry[];
  errors: string[];
}
