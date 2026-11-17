/**
 * Script Injection Tool
 *
 * Inject and execute JavaScript scripts in pages
 */

import { BaseBrowserToolExecutor, ToolResult, createErrorResponse, createSuccessResponse } from './base-tool';

export class InjectScriptTool extends BaseBrowserToolExecutor {
  protected name: string = 'chrome_inject_script';
  private injectedScripts: Record<string, any> = {}; // Store injected scripts

  async execute(args: Record<string, any>): Promise<ToolResult> {
    /**
     * Execute script injection operation (CDP protocol)
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
      const action = args.action || 'inject';

      if (action === 'inject') {
        const script = args.script || '';
        if (!script) {
          return createErrorResponse('Script content cannot be empty');
        }
        const result: any = await cdp.send('Runtime.evaluate', {
          expression: script,
          returnByValue: true,
          awaitPromise: true,
        });
        if (result.exceptionDetails) {
          return createErrorResponse(JSON.stringify(result.exceptionDetails));
        }
        return createSuccessResponse({
          executed: true,
          result: result.result?.value,
          type: result.result?.type,
        });
      } else if (action === 'add_script_tag') {
        const url = args.url || '';
        const content = args.content || '';
        const scriptId = args.id || '';
        if (!url && !content) {
          return createErrorResponse('Must provide URL or content');
        }
        if (url) {
          const expr = `
            new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = '${url}';
              ${scriptId ? `script.id = '${scriptId}';` : ''}
              script.onload = () => resolve({success: true, message: 'Script loaded successfully', src: '${url}'});
              script.onerror = () => reject({success: false, error: 'Script loading failed', src: '${url}'});
              document.head.appendChild(script);
            })
          `;
          const result: any = await cdp.send('Runtime.evaluate', {
            expression: expr,
            returnByValue: true,
            awaitPromise: true,
          });
          if (result.exceptionDetails) {
            return createErrorResponse(JSON.stringify(result.exceptionDetails));
          }
          return createSuccessResponse(result.result?.value || {});
        } else {
          const expr = `
            (() => {
              const script = document.createElement('script');
              script.textContent = \`${content}\`;
              ${scriptId ? `script.id = '${scriptId}';` : ''}
              document.head.appendChild(script);
              return {success: true, message: 'Script tag added successfully', type: 'inline'};
            })()
          `;
          const result: any = await cdp.send('Runtime.evaluate', {
            expression: expr,
            returnByValue: true,
          });
          if (result.exceptionDetails) {
            return createErrorResponse(JSON.stringify(result.exceptionDetails));
          }
          return createSuccessResponse(result.result?.value || {});
        }
      } else if (action === 'remove_script') {
        const elementId = args.element_id || '';
        if (!elementId) {
          return createErrorResponse('Must provide element_id');
        }
        const expr = `
          (() => {
            const element = document.getElementById('${elementId}');
            if (element && element.tagName.toLowerCase() === 'script') {
              element.remove();
              return { success: true, message: 'Script element removed' };
            } else {
              return { success: false, error: 'Specified script element not found' };
            }
          })()
        `;
        const result: any = await cdp.send('Runtime.evaluate', {
          expression: expr,
          returnByValue: true,
        });
        if (result.exceptionDetails) {
          return createErrorResponse(JSON.stringify(result.exceptionDetails));
        }
        return createSuccessResponse(result.result?.value || {});
      } else if (action === 'list_scripts') {
        const expr = `
          (() => {
            const scripts = Array.from(document.querySelectorAll('script'));
            return scripts.map((script, index) => ({
              index: index,
              id: script.id || null,
              src: script.src || null,
              type: script.type || 'text/javascript',
              async: script.async,
              defer: script.defer,
              hasContent: !!script.textContent.trim(),
              contentLength: script.textContent.length,
              contentPreview: script.textContent.trim().substring(0, 100)
            }));
          })()
        `;
        const result: any = await cdp.send('Runtime.evaluate', {
          expression: expr,
          returnByValue: true,
        });
        const pageScripts = result.result?.value || [];
        return createSuccessResponse({
          page_scripts: pageScripts,
          total_page_scripts: pageScripts.length,
        });
      } else {
        return createErrorResponse(`Unknown script injection operation: ${action}`);
      }
    } catch (error: any) {
      return createErrorResponse(`Script injection operation failed: ${error.message}`);
    }
  }
}

export class ScriptLibraryTool extends BaseBrowserToolExecutor {
  protected name: string = 'chrome_script_library';
  private libraries: Record<string, string> = {
    jquery: 'https://code.jquery.com/jquery-3.6.0.min.js',
    lodash: 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js',
    moment: 'https://cdn.jsdelivr.net/npm/moment@2.29.4/moment.min.js',
    axios: 'https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js',
    'chart.js': 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.min.js',
  };

  async execute(args: Record<string, any>): Promise<ToolResult> {
    /**
     * Execute script library operation (CDP protocol)
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
      const action = args.action || 'load';

      if (action === 'load') {
        const libraryName = (args.library || '').toLowerCase();
        const customUrl = args.url || '';
        let url: string;
        let name: string;

        if (customUrl) {
          url = customUrl;
          name = args.library || 'custom';
        } else if (libraryName in this.libraries) {
          url = this.libraries[libraryName];
          name = libraryName;
        } else {
          return createErrorResponse(`Unknown script library: ${libraryName}`);
        }

        const expr = `
          new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '${url}';
            script.onload = () => resolve({
              success: true,
              library: '${name}',
              url: '${url}',
              message: 'Script library loaded successfully'
            });
            script.onerror = () => reject({
              success: false,
              library: '${name}',
              url: '${url}',
              error: 'Script library loading failed'
            });
            document.head.appendChild(script);
          })
        `;
        const result: any = await cdp.send('Runtime.evaluate', {
          expression: expr,
          returnByValue: true,
          awaitPromise: true,
        });
        return createSuccessResponse(result.result?.value || {});
      } else if (action === 'list') {
        return createSuccessResponse({
          libraries: this.libraries,
          count: Object.keys(this.libraries).length,
        });
      } else if (action === 'check') {
        const libraryName = (args.library || '').toLowerCase();
        const expr = `
          (() => {
            return {
              jquery: {
                loaded: typeof $ !== 'undefined' || typeof jQuery !== 'undefined',
                version: typeof $ !== 'undefined' ? ($.fn ? $.fn.jquery : 'unknown') : null
              },
              lodash: {
                loaded: typeof _ !== 'undefined',
                version: typeof _ !== 'undefined' ? _.VERSION : null
              },
              moment: {
                loaded: typeof moment !== 'undefined',
                version: typeof moment !== 'undefined' ? moment.version : null
              },
              axios: {
                loaded: typeof axios !== 'undefined',
                version: typeof axios !== 'undefined' ? axios.VERSION : null
              },
              'chart.js': {
                loaded: typeof Chart !== 'undefined',
                version: typeof Chart !== 'undefined' ? Chart.version : null
              }
            };
          })()
        `;
        const result: any = await cdp.send('Runtime.evaluate', {
          expression: expr,
          returnByValue: true,
        });
        const librariesStatus = result.result?.value || {};
        if (libraryName && libraryName in librariesStatus) {
          return createSuccessResponse({
            library: libraryName,
            status: librariesStatus[libraryName],
          });
        } else {
          return createSuccessResponse({
            all_libraries: librariesStatus,
          });
        }
      } else {
        return createErrorResponse(`Unknown script library operation: ${action}`);
      }
    } catch (error: any) {
      return createErrorResponse(`Script library operation failed: ${error.message}`);
    }
  }
}

export class SendCommandToInjectScriptTool extends BaseBrowserToolExecutor {
  /**
   * Tool to send a custom event/command to a script previously injected into the page.
   */
  protected name: string = 'chrome_send_command_to_inject_script';

  async execute(args: Record<string, any>): Promise<ToolResult> {
    /**
     * Args:
     *   tabId: (optional) Target tab ID. If not provided, uses the current active tab.
     *   eventName: (required) The event name your injected content script listens for.
     *   payload: (optional) The payload passed to the event, must be a JSON string.
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
      const eventName = args.eventName;
      const payload = args.payload || '';

      if (!eventName) {
        return createErrorResponse('eventName is required.');
      }

      // Prepare the script to dispatch the custom event
      const script = `
        (() => {
          let payload;
          try {
            payload = JSON.parse(${JSON.stringify(payload)});
          } catch (e) {
            payload = ${JSON.stringify(payload)};
          }
          const event = new CustomEvent(${JSON.stringify(eventName)}, { detail: payload });
          window.dispatchEvent(event);
          return {
            success: true,
            eventName: ${JSON.stringify(eventName)},
            payload: payload
          };
        })()
      `;

      const result: any = await cdp.send('Runtime.evaluate', {
        expression: script,
        returnByValue: true,
        awaitPromise: true,
      });

      if (result.exceptionDetails) {
        return createErrorResponse(JSON.stringify(result.exceptionDetails));
      }

      return createSuccessResponse(result.result?.value || {});
    } catch (error: any) {
      return createErrorResponse(`Failed to send command to injected script: ${error.message}`);
    }
  }
}
