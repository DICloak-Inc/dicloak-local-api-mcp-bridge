/**
 * Screenshot Tool
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseBrowserToolExecutor, ToolResult, createErrorResponse, createSuccessResponse } from './base-tool';

export class ScreenshotTool extends BaseBrowserToolExecutor {
  constructor() {
    super();
    this.name = 'take_screenshot';
  }

  async execute(args: Record<string, any>): Promise<ToolResult> {
    try {
      const {
        envId,
        name: screenshotName,
        selector,
        width = null,
        height = null,
        storeBase64 = false,
        fullPage = true,
        savePng = true,
        folder,
        urlBase,
      } = args;

      if (!envId) {
        return createErrorResponse('envId is required');
      }

      const cdpClient = this.getCdpClient(envId);
      if (!cdpClient?.page) {
        return createErrorResponse('CDP client not connected. Please check the environment id parameter and ensure it was retrieved from start_browser tool.');
      }

      // Set viewport
      if (width && height) {
        await cdpClient.page.setViewportSize({ width, height });
      }

      let screenshotBuffer: Buffer;

      // Take screenshot
      if (selector) {
        const element = await cdpClient.page.$(selector);
        if (!element) {
          return createErrorResponse(`Element not found: ${selector}, please verify the selector is correct or retry the operation later if the page was not loaded completely.`);
        }
        screenshotBuffer = await element.screenshot({ type: 'png' });
      } else {
        screenshotBuffer = await cdpClient.page.screenshot({
          type: 'png',
          fullPage,
        });
      }

      const result: any = {
        success: true,
      };

      // Save as PNG
      if (savePng && folder) {
        const filename = screenshotName || `screenshot_${Date.now()}.png`;
        let filepath = path.join(folder, filename);
        if (!path.extname(filepath)) {
          filepath += '.png';
        }

        // Ensure directory exists
        if (!fs.existsSync(folder)) {
          fs.mkdirSync(folder, { recursive: true });
        }

        fs.writeFileSync(filepath, screenshotBuffer);
        result.saved = true;
        result.path = filepath;

        if (urlBase) {
          result.url = `${urlBase}screenshots/${filename}`;
        }
      }

      // Return base64
      if (storeBase64) {
        result.base64 = screenshotBuffer.toString('base64');
      }

      return createSuccessResponse(result);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  }
}
