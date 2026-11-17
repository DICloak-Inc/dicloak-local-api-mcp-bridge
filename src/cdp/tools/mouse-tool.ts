/**
 * Mouse and Touch Control Tool
 *
 * Provides basic mouse and touch control using Playwright.
 * Refer to https://playwright.dev/docs/api/class-mouse for more detail about mouse control in playwright.
 */

import { BaseBrowserToolExecutor, ToolResult, createErrorResponse, createSuccessResponse } from './base-tool';

/**
 * Mouse and Touch Control Tool
 */
export class MouseTool extends BaseBrowserToolExecutor {
  constructor() {
    super();
    this.name = 'chrome_mouse_control';
  }

  async execute(args: Record<string, any>): Promise<ToolResult> {
    try {
      const { envId, action, coordinates, selector, button = 'left', count = 1, delay = 0, touch = false } = args;

      if (!envId) {
        return createErrorResponse('envId is required');
      }

      const cdpClient = this.getCdpClient(envId);
      if (!cdpClient?.page) {
        return createErrorResponse('CDP client not connected. Please check the environment id parameter and ensure it was retrieved from start_browser tool.');
      }

      const page = cdpClient.page;
      let x: number, y: number;

      // Get coordinates based on selector or provided coordinates
      if (selector) {
        const element = await page.$(selector);
        if (!element) {
          return createErrorResponse(`Element not found with selector: ${selector}, , please verify the selector is correct or retry the operation later if the page was not loaded completely.`);
        }
        const box = await element.boundingBox();
        if (!box) {
          return createErrorResponse(`Element bounding box not found for selector: ${selector}, it is hidden element.`);
        }
        x = box.x + box.width / 2;
        y = box.y + box.height / 2;
      } else if (coordinates && typeof coordinates === 'object' && 'x' in coordinates && 'y' in coordinates) {
        x = coordinates.x;
        y = coordinates.y;
      } else {
        return createErrorResponse('Either selector or coordinates must be provided');
      }

      switch (action) {
        case 'move':
          if (touch) {
            await page.mouse.move(x, y);
          } else {
            await page.mouse.move(x, y);
          }
          return createSuccessResponse(`Successfully ${touch ? 'touch moved' : 'mouse moved'} to coordinates (${x}, ${y})`);

        case 'click':
          if (touch) {
            await page.touchscreen.tap(x, y);
          } else {
            await page.mouse.click(x, y, { button: button as any, clickCount: count, delay });
          }
          return createSuccessResponse(`Successfully ${touch ? 'touched' : 'clicked'} at coordinates (${x}, ${y}) with ${button} button ${count} times`);

        case 'down':
          if (touch) {
            // Touch press down (simulate with mouse down for now)
            await page.mouse.down({ button: button as any });
          } else {
            await page.mouse.down({ button: button as any });
          }
          return createSuccessResponse(`Successfully pressed ${touch ? 'touch' : 'mouse'} ${button} button at coordinates (${x}, ${y})`);

        case 'up':
          if (touch) {
            // Touch release (simulate with mouse up for now)
            await page.mouse.up({ button: button as any });
          } else {
            await page.mouse.up({ button: button as any });
          }
          return createSuccessResponse(`Successfully released ${touch ? 'touch' : 'mouse'} ${button} button at coordinates (${x}, ${y})`);

        case 'wheel':
          const { deltaX = 0, deltaY = 0 } = args;
          await page.mouse.wheel(deltaX, deltaY);
          return createSuccessResponse(`Successfully performed mouse wheel with deltaX: ${deltaX}, deltaY: ${deltaY}`);

        default:
          return createErrorResponse(`Unsupported action: ${action}. Supported actions: move, click, down, up, wheel`);
      }
    } catch (error: any) {
      console.error(`Error in MouseTool.execute: ${error.message}`);
      return createErrorResponse(error.message);
    }
  }
}
