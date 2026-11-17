/**
 * Console Tool
 *
 * Capture and retrieve all console output from the current active browser tab/page.
 */

import { BaseBrowserToolExecutor, ToolResult, createErrorResponse, createSuccessResponse } from './base-tool';

export class ConsoleTool extends BaseBrowserToolExecutor {
  protected name: string = 'chrome_console';
  private consoleLogs: any[] = [];
  private isMonitoring: boolean = false;
  private maxLogs: number = 500;

  async execute(args: Record<string, any>): Promise<ToolResult> {
    /**
     * Supported args:
     *   url: string (optional)
     *   includeExceptions: boolean (default: true)
     *   maxMessages: number (default: 100)
     */
    try {
      const envId = args.envId;
      if (!envId) {
        return createErrorResponse('envId is required');
      }

      const cdpClient = this.getCdpClient(envId);
      if (!cdpClient?.cdpSession) {
        return createErrorResponse('CDP client is not initialized or missing cdpSession. Please check the environment id parameter and ensure it was retrieved from start_browser tool.');
      }

      const cdp = cdpClient.cdpSession;

      // Optionally navigate to a URL
      const url = args.url;
      if (url) {
        await cdp.send('Page.navigate', { url });
        // Wait for page load
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const includeExceptions = args.includeExceptions !== false; // default true
      const maxMessages = args.maxMessages || 100;

      // Enable Runtime domain to receive console events
      await cdp.send('Runtime.enable');
      const logs: any[] = [];

      // Helper to process console events
      const handleConsoleEvent = (event: any) => {
        const entry = {
          type: event.type,
          level: event.type,
          args: event.args?.map((arg: any) => arg.value || arg.description || '') || [],
          text: event.args?.map((arg: any) => String(arg.value || arg.description || '')).join(' ') || '',
          timestamp: event.timestamp,
          stackTrace: event.stackTrace || {},
        };
        logs.push(entry);
      };

      // Helper to process exception events
      const handleExceptionEvent = (event: any) => {
        const details = event.exceptionDetails || {};
        const entry = {
          type: 'error',
          level: 'error',
          text: `Uncaught ${details.exception?.className || 'Error'}: ${details.exception?.description || ''}`,
          exception_details: details,
          timestamp: details.timestamp,
          line_number: details.lineNumber,
          column_number: details.columnNumber,
          script_id: details.scriptId,
        };
        logs.push(entry);
      };

      // Listen for console events and exceptions
      const collectConsoleLogs = async () => {
        // Attach event listeners
        cdp.on('Runtime.consoleAPICalled', handleConsoleEvent);
        if (includeExceptions) {
          cdp.on('Runtime.exceptionThrown', handleExceptionEvent);
        }
        // Wait for a short period to collect logs
        await new Promise((resolve) => setTimeout(resolve, 500));
        // Detach listeners
        cdp.off('Runtime.consoleAPICalled', handleConsoleEvent);
        if (includeExceptions) {
          cdp.off('Runtime.exceptionThrown', handleExceptionEvent);
        }
      };

      await collectConsoleLogs();

      // Limit the number of messages
      const limitedLogs = maxMessages > 0 ? logs.slice(-maxMessages) : logs;

      return createSuccessResponse({
        count: limitedLogs.length,
        logs: limitedLogs,
        is_monitoring: false, // This tool does not keep monitoring after execution
      });
    } catch (error: any) {
      return createErrorResponse(`Console operation failed: ${error.message}`);
    }
  }
}
