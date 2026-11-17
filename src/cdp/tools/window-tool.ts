/**
 * Window and Tab Management Tools
 */

import { BaseBrowserToolExecutor, ToolResult, createErrorResponse, createSuccessResponse } from './base-tool';

/**
 * Get all windows and tabs
 */
export class WindowTool extends BaseBrowserToolExecutor {
  constructor() {
    super();
    this.name = 'get_windows_and_tabs';
  }

  async execute(args: Record<string, any>): Promise<ToolResult> {
    try {
      const { envId } = args;
      if (!envId) {
        return createErrorResponse('envId is required');
      }

      const cdpClient = this.getCdpClient(envId);
      if (!cdpClient?.cdpSession) {
        console.error('CDP client not connected, no valid cdp client in the session.');
        return createErrorResponse('CDP client is not initialized or missing cdpSession. Please check the environment id parameter and ensure it was retrieved from start_browser tool.');
      }

      console.log('[WindowTool]Fetching targets from CDP session...');
      const targets = await cdpClient.cdpSession.send('Target.getTargets');
      const targetInfos = (targets as any).targetInfos || [];

      const windows: Array<{ windowId: number; tabs: any[] }> = [];
      const tabs = targetInfos
        .filter((t: any) => t.type === 'page')
        .map((t: any, index: number) => ({
          tabId: index + 1,
          targetId: t.targetId,
          url: t.url,
          title: t.title,
          active: t.attached || false,
        }));

      if (tabs.length > 0) {
        windows.push({
          windowId: 1,
          tabs,
        });
      }

      return createSuccessResponse({ windows });
    } catch (error: any) {
      console.log('Error in WindowTool execute:', error);
      return createErrorResponse(error.message);
    }
  }
}

/**
 * Navigate to URL
 */
export class NavigateTool extends BaseBrowserToolExecutor {
  constructor() {
    super();
    this.name = 'navigate';
  }

  async execute(args: Record<string, any>): Promise<ToolResult> {
    try {
      const { envId, url, newTab = false, width = undefined, height = undefined, refresh = false } = args;

      if (!envId) {
        return createErrorResponse('envId is required');
      }

      const cdpClient = this.getCdpClient(envId);
      if (!cdpClient?.page) {
        return createErrorResponse('CDP client not connected. Maybe the environment is closed.');
      }

      // Handle refresh
      if (refresh) {
        await cdpClient.page.reload();
        return createSuccessResponse('Page refreshed successfully.');
      }

      // Validate URL
      if (!url) {
        return createErrorResponse('URL is required.');
      }

      let formattedUrl = url.trim();
      if (!/^https?:\/\//i.test(formattedUrl)) {
        formattedUrl = 'https://' + formattedUrl;
      }

      // Set viewport
      if (width && height) {
        await cdpClient.page.setViewportSize({ width, height });
      }

      // Navigate
      if (newTab) {
        const context = cdpClient.page.context();
        const newPage = await context.newPage();
        await newPage.goto(formattedUrl, { waitUntil: 'domcontentloaded' });
        // Create new CDP session for the new page and update all domain objects
        const newCDPSession = await newPage.context().newCDPSession(newPage);
        await cdpClient.updateSession(newPage, newCDPSession);
        return createSuccessResponse(`Navigated to ${formattedUrl} in new tab`);
      } else {
        await cdpClient.page.goto(formattedUrl, { waitUntil: 'domcontentloaded' });
        return createSuccessResponse(`Navigated to ${formattedUrl}`);
      }
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  }
}

/**
 * Close tabs
 */
export class CloseTabsTool extends BaseBrowserToolExecutor {
  constructor() {
    super();
    this.name = 'close_tabs';
  }

  async execute(args: Record<string, any>): Promise<ToolResult> {
    try {
      const { envId, tabIds, url, closeAll = false } = args;

      if (!envId) {
        return createErrorResponse('envId is required');
      }

      const cdpClient = this.getCdpClient(envId);
      if (!cdpClient?.cdpSession) {
        return createErrorResponse('CDP client is not initialized or missing cdpSession. Please check the environment id parameter and ensure it was retrieved from start_browser tool.');
      }

      // Save context before closing tabs
      const context = cdpClient.page ? cdpClient.page.context() : null;
      const targets = await cdpClient.cdpSession.send('Target.getTargets');
      const targetInfos = (targets as any).targetInfos || [];
      const pageTargets = targetInfos.filter((t: any) => t.type === 'page');

      let closedCount = 0;

      for (const target of pageTargets) {
        let shouldClose = closeAll;

        if (!shouldClose && url && target.url === url) {
          shouldClose = true;
        }

        if (!shouldClose && tabIds && Array.isArray(tabIds)) {
          const index = pageTargets.indexOf(target);
          if (tabIds.includes(index + 1)) {
            shouldClose = true;
          }
        }

        if (shouldClose) {
          await cdpClient.cdpSession.send('Target.closeTarget', { targetId: target.targetId });
          closedCount++;
        }
      }

      // After closing tabs, update cdpClient.page and cdpSession
      if (closedCount > 0 && context) {
        try {
          const pages = context.pages();
          const activePage = pages.find(p => !p.isClosed());

          if (activePage) {
            // Recreate CDP session for the new page
            try {
              const newCDPSession = await activePage.context().newCDPSession(activePage);
              // Use updateSession method to refresh all domain objects
              await cdpClient.updateSession(activePage, newCDPSession);
            } catch (sessionError) {
              console.error(`Failed to update CDP session: ${(sessionError as Error).message}`);
            }
          }
        } catch (error: any) {
          console.error(`Failed to update active page after closing: ${error.message}`);
        }
      }

      return createSuccessResponse(`Closed ${closedCount} tab(s)`);
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  }
}

/**
 * History navigation (back/forward)
 */
export class HistoryNavigationTool extends BaseBrowserToolExecutor {
  constructor() {
    super();
    this.name = 'go_back_or_forward';
  }

  async execute(args: Record<string, any>): Promise<ToolResult> {
    try {
      const { envId, isForward = false } = args;

      if (!envId) {
        return createErrorResponse('envId is required');
      }

      const cdpClient = this.getCdpClient(envId);
      if (!cdpClient?.page) {
        return createErrorResponse('CDP client is not initialized or missing page. Please check the environment id parameter and ensure it was retrieved from start_browser tool.');
      }

      if (isForward) {
        await cdpClient.page.goForward();
        return createSuccessResponse('Navigated forward');
      } else {
        await cdpClient.page.goBack();
        return createSuccessResponse('Navigated back');
      }
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  }
}

/**
 * Switch to a different tab
 */
export class SwitchTabTool extends BaseBrowserToolExecutor {
  constructor() {
    super();
    this.name = 'switch_tab';
  }

  async execute(args: Record<string, any>): Promise<ToolResult> {
    try {
      const { envId, tabId, title, url } = args;

      if (!envId) {
        return createErrorResponse('envId is required');
      }

      const cdpClient = this.getCdpClient(envId);
      if (!cdpClient?.cdpSession) {
        return createErrorResponse('CDP client is not initialized or missing cdpSession. Please check the environment id parameter and ensure it was retrieved from start_browser tool.');
      }

      // Get all targets
      const targets = await cdpClient.cdpSession.send('Target.getTargets');
      const targetInfos = (targets as any).targetInfos || [];
      const pageTargets = targetInfos.filter((t: any) => t.type === 'page');

      if (pageTargets.length === 0) {
        return createErrorResponse('No tabs found');
      }

      let targetToSwitch = null;

      // Find target by tabId (1-based index)
      if (tabId !== undefined) {
        const index = tabId - 1;
        if (index >= 0 && index < pageTargets.length) {
          targetToSwitch = pageTargets[index];
        } else {
          return createErrorResponse(`Invalid tabId: ${tabId}. Valid range is 1-${pageTargets.length}`);
        }
      }
      // Find target by title
      else if (title) {
        targetToSwitch = pageTargets.find((t: any) => t.title && t.title.includes(title));
        if (!targetToSwitch) {
          return createErrorResponse(`No tab found with title containing: ${title}`);
        }
      }
      // Find target by URL
      else if (url) {
        targetToSwitch = pageTargets.find((t: any) => t.url && t.url.includes(url));
        if (!targetToSwitch) {
          return createErrorResponse(`No tab found with URL containing: ${url}`);
        }
      }
      // No criteria provided
      else {
        return createErrorResponse('Please provide tabId, title, or url to switch tab');
      }

      // Activate the target
      await cdpClient.cdpSession.send('Target.activateTarget', {
        targetId: targetToSwitch.targetId
      });

      // Update cdpClient.page to the switched tab's page
      if (cdpClient.page) {
        try {
          const context = cdpClient.page.context();
          const pages = context.pages();

          // Find the page that matches the target URL
          const targetPage = pages.find(p =>
            !p.isClosed() && p.url() === targetToSwitch.url
          );

          if (targetPage) {
            // Create new CDP session for the target page and update all domain objects
            const newCDPSession = await targetPage.context().newCDPSession(targetPage);
            await cdpClient.updateSession(targetPage, newCDPSession);
          }
        } catch (error: any) {
          console.error(`Failed to update page reference: ${error.message}`);
        }
      }

      return createSuccessResponse({
        message: `Switched to tab: ${targetToSwitch.title || targetToSwitch.url}`,
        targetId: targetToSwitch.targetId,
        title: targetToSwitch.title,
        url: targetToSwitch.url
      });
    } catch (error: any) {
      return createErrorResponse(error.message);
    }
  }
}
