/**
 * Web Content Fetcher Tool
 *
 * Get HTML content and text content from web pages
 */

import { BaseBrowserToolExecutor, ToolResult, createErrorResponse, createSuccessResponse } from './base-tool';

export class WebFetcherTool extends BaseBrowserToolExecutor {
  protected name: string = 'chrome_get_web_content';

  async execute(args: Record<string, any>): Promise<ToolResult> {
    /**
     * Get web page content (CDP protocol)
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
      const htmlContent = args.htmlContent || false;
      const textContent = args.textContent || false;
      let includeMetadata = false;
      if (textContent) {
        includeMetadata = true;
      }
      const selector = args.selector;
      const url = args.url;

      if (url) {
        await cdp.send('Page.navigate', { url });
        // Wait for page load
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const result: any = {};

      if (selector) {
        console.error(`Fetching content for selector: ${selector}`);
        if (htmlContent) {
          const content = await this._getElementHtml(selector, cdp);
          console.error(`Fetched HTML content length: ${content.length}`);
          result.htmlContent = content;
        }
        if (textContent) {
          const content = await this._getElementText(selector, cdp);
          console.error(`Fetched text content length: ${content.length}`);
          result.textContent = content;
        }
      } else {
        console.error(`Fetching full page content`);
        if (htmlContent) {
          const content = await this._getPageHtml(cdp);
          console.error(`Fetched page HTML content length: ${content.length}`);
          result.htmlContent = content;
        }
        if (textContent) {
          const content = await this._getPageText(cdp);
          console.error(`Fetched page text content length: ${content.length}`);
          result.textContent = content;
        }
      }

      if (includeMetadata) {
        result.metadata = await this._getPageMetadata(cdp);
      }

      return createSuccessResponse(result);
    } catch (error: any) {
      return createErrorResponse(`Failed to get web content: ${error.message}`);
    }
  }

  private async _getElementHtml(selector: string, cdp: any): Promise<string> {
    /**
     * Get element's HTML content (CDP protocol)
     */
    const script = `
      (() => {
        const element = document.querySelector('${selector}');
        return element ? element.outerHTML : null;
      })()
    `;
    const result: any = await cdp.send('Runtime.evaluate', { expression: script, returnByValue: true });
    return result.result?.value || '';
  }

  private async _getElementText(selector: string, cdp: any): Promise<string> {
    /**
     * Get element's text content (CDP protocol)
     */
    const script = `
      (() => {
        const element = document.querySelector('${selector}');
        return element ? element.textContent.trim() : null;
      })()
    `;
    const result: any = await cdp.send('Runtime.evaluate', { expression: script, returnByValue: true });
    return result.result?.value || '';
  }

  private async _getPageHtml(cdp: any): Promise<string> {
    /**
     * Get entire page's HTML (CDP protocol)
     */
    const script = 'document.documentElement.outerHTML';
    const result: any = await cdp.send('Runtime.evaluate', { expression: script, returnByValue: true });
    return result.result?.value || '';
  }

  private async _getPageText(cdp: any): Promise<string> {
    /**
     * Get entire page's visible text (CDP protocol)
     */
    const script = 'document.title';
    try {
      const result: any = await cdp.send('Runtime.evaluate', { expression: script, returnByValue: true });
      const title = result.result?.value || '';
      return `Page title: ${title}\n\n[Note: Page text extraction may cause connection issues on complex pages, currently only returning title]`;
    } catch (error: any) {
      return `Failed to get page text: ${error.message}`;
    }
  }

  private async _getPageMetadata(cdp: any): Promise<Record<string, any>> {
    /**
     * Get page metadata (CDP protocol)
     */
    const script = `
      (() => {
        return {
          title: document.title,
          url: window.location.href,
          description: document.querySelector('meta[name="description"]')?.content || '',
          keywords: document.querySelector('meta[name="keywords"]')?.content || '',
          author: document.querySelector('meta[name="author"]')?.content || '',
          charset: document.characterSet,
          language: document.documentElement.lang || '',
          lastModified: document.lastModified
        };
      })()
    `;
    const result: any = await cdp.send('Runtime.evaluate', { expression: script, returnByValue: true });
    return result.result?.value || {};
  }
}

/**
 * Element Attributes Tool
 *
 * Get all attributes of a specified element
 */
export class ElementAttributesTool extends BaseBrowserToolExecutor {
  protected name: string = 'chrome_get_element_attributes';

  async execute(args: Record<string, any>): Promise<ToolResult> {
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
      const selector = args.selector;

      if (!selector) {
        return createErrorResponse('selector parameter is required');
      }

      // Check if element exists with retry (2 retries, 500ms interval)
      if (cdpClient?.page) {
        let elementExists = false;
        for (let i = 0; i <= 2; i++) {
          try {
            const count = await cdpClient.page.locator(selector).first().count();
            if (count > 0) {
              elementExists = true;
              break;
            }
          } catch (error) {
            console.log(`[ElementAttributesTool]Error checking element existence: ${error}`);
          }
          if (i < 2) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        if (!elementExists) {
          return createErrorResponse(
            `Element not found with selector: '${selector}'. ` +
            `Please verify the selector is correct or retry the operation later, if the page was not loaded completely.`
          );
        }
      }

      const attributes = await this._getElementAttributes(selector, cdp);
      return createSuccessResponse(attributes);
    } catch (error: any) {
      return createErrorResponse(`Failed to get element attributes: ${error.message}`);
    }
  }

  private async _getElementAttributes(selector: string, cdp: any): Promise<Record<string, any>> {
    /**
     * Get all attributes of a specified element via CDP protocol
     */
    const script = `
      (() => {
        const element = document.querySelector('${selector}');
        if (!element) {
          return { error: 'Element not found' };
        }
        const attributes = Object.fromEntries(
          Array.from(element.attributes).map(attr => [attr.name, attr.value])
        );
        const rect = element.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(element);
        const styleObj = {};
        for (let i = 0; i < computedStyle.length; i++) {
          const prop = computedStyle[i];
          try {
            styleObj[prop] = computedStyle.getPropertyValue(prop);
          } catch (e) {
            styleObj[prop] = '[error]';
          }
        }
        return {
          tagName: element.tagName,
          innerText: element.innerText || '',
          textContent: element.textContent || ''
          outerHTML: element.outerHTML,
          attributes,
          computedStyle: styleObj,
          boundingBox: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left
          }
        };
      })()
    `;
    const result: any = await cdp.send('Runtime.evaluate', { expression: script, returnByValue: true });
    console.log(`[ElementAttributesTool]Raw result:`, result);
    return result.result?.value || {};
  }
}
