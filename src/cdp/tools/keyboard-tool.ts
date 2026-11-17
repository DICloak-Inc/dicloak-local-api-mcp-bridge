/**
 * Keyboard Operations Tool
 *
 * Simulate keyboard input and shortcuts
 *
 * Refer to https://playwright.dev/docs/api/class-keyboard for supported keys and combinations.
 */

import { BaseBrowserToolExecutor, ToolResult, createErrorResponse, createSuccessResponse } from './base-tool';

export class KeyboardTool extends BaseBrowserToolExecutor {
  protected name: string = 'chrome_keyboard';

  async execute(args: Record<string, any>): Promise<ToolResult> {
    /**
     * Execute keyboard operation using Playwright Page API
     */
    try {
      const envId = args.envId;
      if (!envId) {
        return createErrorResponse('envId is required');
      }

      const cdpClient = this.getCdpClient(envId);
      if (!cdpClient?.page) {
        return createErrorResponse('CDP client is not initialized or missing cdpSession. Please check the environment id parameter and ensure it was retrieved from start_browser tool.');
      }

      const page = cdpClient.page;
      const keys = args.keys || '';
      const selector = args.selector || '';
      const delay = args.delay || 0;

      if (!keys) {
        return createErrorResponse('keys parameter cannot be empty');
      }

      // Focus on element if selector is provided
      if (selector) {
        try {
          await page.locator(selector).focus();
        } catch (error: any) {
          return createErrorResponse(`Failed to focus element: ${error.message}`);
        }
      }

      // Parse and execute key sequences
      const keySequences = this._parseKeySequence(keys);
      for (const sequence of keySequences) {
        await this._executeKeySequence(sequence, page);
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      return createSuccessResponse(`Successfully executed keyboard operation: ${keys}`);
    } catch (error: any) {
      return createErrorResponse(`Keyboard operation failed: ${error.message}`);
    }
  }

  private _parseKeySequence(keys: string): Array<{ type: string; modifiers?: string[]; key: string }> {
    /**
     * Parse key sequence
     */
    const sequences: Array<{ type: string; modifiers?: string[]; key: string }> = [];

    // Split multiple key sequences (separated by comma)
    const keyParts = keys.split(',').map((part) => part.trim());

    for (const part of keyParts) {
      if (part.includes('+')) {
        // Handle key combinations (e.g., Ctrl+C)
        const keyCombo = part.split('+').map((k) => k.trim());
        const modifiers: string[] = [];
        const mainKey = keyCombo[keyCombo.length - 1]; // Last one is the main key

        for (let i = 0; i < keyCombo.length - 1; i++) {
          modifiers.push(keyCombo[i]);
        }

        sequences.push({
          type: 'combo',
          modifiers,
          key: mainKey,
        });
      } else {
        // Single key
        sequences.push({
          type: 'single',
          key: part,
        });
      }
    }

    return sequences;
  }

  private async _executeKeySequence(sequence: { type: string; modifiers?: string[]; key: string }, page: any): Promise<void> {
    /**
     * Execute single key sequence using Playwright
     */
    if (sequence.type === 'combo') {
      // For key combinations, use Playwright's keyboard.press with modifier syntax
      const modifiers = sequence.modifiers || [];
      const keyString = [...modifiers, sequence.key].join('+');
      await page.keyboard.press(keyString);
    } else {
      // For single keys, use keyboard.press
      await page.keyboard.press(sequence.key);
    }
  }
}
