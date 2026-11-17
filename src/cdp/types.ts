/**
 * Tool Result Interface
 */
export interface ToolResult {
  content: Array<{
    type: 'text' | 'object';
    text?: string;
    result?: any;
  }>;
  isError: boolean;
}

/**
 * Create error response
 */
export function createErrorResponse(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * Create success response
 */
export function createSuccessResponse(data: any, result?: any): ToolResult {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  if (result !== undefined) {
    return {
      content: [{ type: 'object', result, text }],
      isError: false,
    };
  }

  return {
    content: [{ type: 'text', text }],
    isError: false,
  };
}

