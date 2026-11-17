/**
 * Page Interaction Tool
 *
 * Provide click, form filling and other interaction features
 */

import { BaseBrowserToolExecutor, ToolResult, createErrorResponse, createSuccessResponse } from './base-tool';

export class ClickTool extends BaseBrowserToolExecutor {
  protected name: string = 'chrome_click_element';

  async execute(args: Record<string, any>): Promise<ToolResult> {
    /**
     * Execute click operation (CDP protocol)
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
      const selector = args.selector;
      const coordinates = args.coordinates;
      const waitForNavigation = args.waitForNavigation || false;
      let resultMessage = '';

      if (coordinates) {
        const x = coordinates.x;
        const y = coordinates.y;
        if (x === undefined || y === undefined) {
          return createErrorResponse('Incomplete coordinates information, x and y coordinates are required');
        }
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x,
          y,
          button: 'left',
          clickCount: 1,
        });
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x,
          y,
          button: 'left',
          clickCount: 1,
        });
        resultMessage = `Clicked coordinates (${x}, ${y}) successfully`;
      } else if (selector) {
        const clickResult = await this._clickElement(selector, cdp);
        if (!clickResult.success) {
          return createErrorResponse(clickResult.error || 'Unknown error');
        }
        resultMessage = `Clicked element '${selector}' successfully`;
      } else {
        return createErrorResponse('Must provide selector or coordinates parameter');
      }

      if (waitForNavigation) {
        try {
          await cdp.send('Page.reload');
          resultMessage += ', page navigation completed';
        } catch (error: any) {
          resultMessage += `, but page navigation wait failed: ${error.message}`;
        }
      }

      return createSuccessResponse(resultMessage);
    } catch (error: any) {
      return createErrorResponse(`Click operation failed: ${error.message}`);
    }
  }

  private async _clickElement(selector: string, cdp: any): Promise<{ success: boolean; error?: string }> {
    /**
     * Click element with specified selector (CDP protocol)
     */
    const script = `
      (() => {
        const element = document.querySelector('${selector}');
        if (!element) {
          return { success: false, error: 'Element not found' };
        }
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return { success: false, error: 'Element not visible' };
        }
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        return {
          success: true,
          x: centerX,
          y: centerY,
          element: element.tagName
        };
      })()
    `;
    const result: any = await cdp.send('Runtime.evaluate', { expression: script, returnByValue: true });
    const elementInfo = result.result?.value || {};
    if (!elementInfo.success) {
      return elementInfo;
    }
    const x = elementInfo.x;
    const y = elementInfo.y;
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
    return { success: true };
  }
}

export class FillTool extends BaseBrowserToolExecutor {
  protected name: string = 'chrome_fill_or_select';

  async execute(args: Record<string, any>): Promise<ToolResult> {
    /**
     * Execute form filling operation (CDP protocol)
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
      const selector = args.selector;
      const value = args.value;

      if (!selector || value === undefined) {
        return createErrorResponse('selector and value parameters are required');
      }

      if (selector.trim() !== '') {
        // Check if element exists with retry
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
              console.log(`[FillTool]Error checking element existence: ${error}`);
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
      }

      const fillResult = await this._fillElement(selector, value, cdp);
      if (fillResult.success) {
        return createSuccessResponse(`Successfully filled '${selector}' with '${value}'`);
      } else {
        return createErrorResponse(fillResult.error || 'Unknown error');
      }
    } catch (error: any) {
      return createErrorResponse(`Form filling failed: ${error.message}`);
    }
  }

  private async _fillElement(selector: string, value: string, cdp: any): Promise<{ success: boolean; error?: string }> {
    /**
     * Fill element with specified selector (CDP protocol)
     */
    const script = `
      (() => {
        const element = document.querySelector('${selector}');
        if (!element) {
          return { success: false, error: 'Element not found' };
        }
        const tagName = element.tagName.toLowerCase();
        const inputType = element.type ? element.type.toLowerCase() : '';
        try {
          if (tagName === 'select') {
            const option = Array.from(element.options).find(opt =>
              opt.value === '${value}' || opt.text === '${value}'
            );
            if (option) {
              element.value = option.value;
              element.dispatchEvent(new Event('change', { bubbles: true }));
              return { success: true, type: 'select' };
            } else {
              return { success: false, error: 'Matching option not found' };
            }
          } else if (tagName === 'input' || tagName === 'textarea') {
            element.focus();
            element.value = '${value}';
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, type: tagName };
          } else {
            element.textContent = '${value}';
            return { success: true, type: 'other' };
          }
        } catch (error) {
          return { success: false, error: error.message };
        }
      })()
    `;
    const result: any = await cdp.send('Runtime.evaluate', { expression: script, returnByValue: true });
    return result.result?.value || { success: false, error: 'Unknown error' };
  }
}

export class InteractiveElementsTool extends BaseBrowserToolExecutor {
  protected name: string = 'chrome_get_interactive_elements';

  async execute(args: Record<string, any>): Promise<ToolResult> {
    /**
     * Get interactive elements on the page (CDP protocol)
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
      const textQuery = args.textQuery || '';
      const selector = args.selector || '';
      const elementType = args.elementType || 'all';
      const includeCoordinates = args.includeCoordinates !== false; // default true

      const elements = await this._getInteractiveElements(elementType, textQuery, selector, includeCoordinates, cdp);
      const result = {
        count: elements.length,
        elements,
      };
      return createSuccessResponse(result);
    } catch (error: any) {
      return createErrorResponse(`Failed to get interactive elements: ${error.message}`);
    }
  }

  private async _getInteractiveElements(
    elementType: string,
    textQuery: string,
    selector: string,
    includeCoordinates: boolean,
    cdp: any
  ): Promise<any[]> {
    /**
     * Get interactive elements list (CDP protocol)
     */
    const script = `
      (() => {
        let elements = [];
        if ('${selector}') {
          elements = Array.from(document.querySelectorAll('${selector}'));
        } else {
          let interactiveSelectors = [
            'button',
            'input',
            'select',
            'textarea',
            'a[href]',
            '[onclick]',
            '[role="button"]',
            '[tabindex]'
          ];
          if ('${elementType}' === 'button') {
            interactiveSelectors.splice(0, interactiveSelectors.length, 'button', '[role="button"]', '[onclick]');
          } else if ('${elementType}' === 'link') {
            interactiveSelectors.splice(0, interactiveSelectors.length, 'a[href]');
          } else if ('${elementType}' === 'input') {
            interactiveSelectors.splice(0, interactiveSelectors.length, 'input', 'select', 'textarea');
          }
          elements = interactiveSelectors.flatMap(sel =>
            Array.from(document.querySelectorAll(sel))
          );
          elements = [...new Set(elements)];
        }
        const result = elements
          .filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
          .map(el => {
            const rect = el.getBoundingClientRect();
            const text = el.textContent ? el.textContent.trim() : '';
            const tag = el.tagName.toLowerCase();
            let elementInfo = {
              tagName: tag,
              type: el.type || '',
              id: el.id || '',
              className: el.className || '',
              text: text,
              value: el.value || '',
              href: el.href || '',
              title: el.title || '',
              alt: el.alt || ''
            };
            if (${includeCoordinates}) {
              elementInfo.coordinates = {
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              };
            }
            return elementInfo;
          });
        if ('${textQuery}') {
          const query = '${textQuery}'.toLowerCase();
          return result.filter(el =>
            el.text.toLowerCase().includes(query) ||
            el.title.toLowerCase().includes(query) ||
            el.alt.toLowerCase().includes(query) ||
            el.value.toLowerCase().includes(query)
          );
        }
        return result;
      })()
    `;
    const result: any = await cdp.send('Runtime.evaluate', { expression: script, returnByValue: true });
    return result.result?.value || [];
  }
}
