/**
 * Base Browser Tool Executor
 *
 * Provides base functionality for all browser tools and CDP connection management
 */

import { CDPClient } from '../cdp-client';
import { ToolResult, createErrorResponse, createSuccessResponse } from '../types';

export abstract class BaseBrowserToolExecutor {
  protected name: string = '';
  protected getCdpClientCallback: ((envId: string) => CDPClient | null) | null = null;

  constructor() {
  }

  /**
   * Set the callback to get CDP client by envId
   */
  setCdpClientCallback(callback: (envId: string) => CDPClient | null): void {
    this.getCdpClientCallback = callback;
  }

  abstract execute(args: Record<string, any>): Promise<ToolResult>;

  /**
   * Get CDP client by environment ID
   */
  protected getCdpClient(envId: string): CDPClient | null {
    if (!this.getCdpClientCallback) {
      return null;
    }
    return this.getCdpClientCallback(envId);
  }

  /**
   * Get active tab ID via CDP protocol
   */
  protected async getActiveTabId(cdpClient: CDPClient): Promise<string | null> {
    if (!cdpClient?.cdpSession) {
      return null;
    }

    try {
      const targets = await cdpClient.cdpSession.send('Target.getTargets');
      const targetInfos = (targets as any).targetInfos;

      for (const target of targetInfos) {
        if (target.type === 'page' && target.attached) {
          return target.targetId;
        }
      }
      return null;
    } catch (error: any) {
      console.error(`Failed to get active tab ID: ${error.message}`);
      return null;
    }
  }

  /**
   * Execute JavaScript in specified tab via CDP protocol
   */
  protected async executeScript(cdpClient: CDPClient, expression: string, tabId?: string): Promise<any> {
    if (!cdpClient?.cdpSession) {
      throw new Error('CDP client not initialized or missing cdpSession');
    }

    try {
      const params: any = { expression };

      if (tabId) {
        // Optional: attach to specified target
        await cdpClient.cdpSession.send('Target.attachToTarget', {
          targetId: tabId,
          flatten: true,
        });
      }

      const result = await cdpClient.cdpSession.send('Runtime.evaluate', params);

      if ((result as any).exceptionDetails) {
        throw new Error(`JavaScript execution error: ${JSON.stringify((result as any).exceptionDetails)}`);
      }

      return (result as any).result?.value;
    } catch (error: any) {
      console.error(`Failed to execute JavaScript: ${error.message}`);
      throw error;
    }
  }
}

export { ToolResult, createErrorResponse, createSuccessResponse };
