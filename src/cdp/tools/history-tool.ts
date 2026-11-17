/**
 * History Operations Tool
 * Only supports search
 */

import { BaseBrowserToolExecutor, ToolResult, createErrorResponse, createSuccessResponse } from './base-tool';
import { CDPClient } from '../cdp-client';

export class HistorySearchTool extends BaseBrowserToolExecutor {
  protected name: string = 'chrome_history';

  async execute(args: Record<string, any>): Promise<ToolResult> {
    /**
     * Execute history operations (CDP protocol does not support browser history management, only session navigation history)
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

      return await this._searchHistory(args, cdpClient);
    } catch (error: any) {
      return createErrorResponse(`History operation failed: ${error.message}`);
    }
  }

  private async _getHistory(args: Record<string, any>, cdpClient: CDPClient): Promise<ToolResult> {
    /**
     * Get browsing history
     */
    try {
      const limit = args.limit || 50;

      // Use CDP native method to get navigation history
      const cdp = cdpClient.cdpSession!;
      const historyResult: any = await cdp.send('Page.getNavigationHistory');

      let entries = historyResult.entries || [];
      const currentIndex = historyResult.currentIndex || 0;

      // Limit the number of returned entries
      if (entries.length > limit) {
        // Prioritize returning records around the current entry
        let startIdx = Math.max(0, currentIndex - Math.floor(limit / 2));
        let endIdx = Math.min(entries.length, startIdx + limit);
        // If there are not enough entries at the end, count limit entries from the end
        if (endIdx - startIdx < limit) {
          startIdx = Math.max(0, endIdx - limit);
        }
        entries = entries.slice(startIdx, endIdx);
      }

      // Format history entries
      const formattedEntries = entries.map((entry: any, i: number) => ({
        index: i,
        id: entry.id,
        url: entry.url,
        title: entry.title,
        userTypedURL: entry.userTypedURL || null,
        transitionType: entry.transitionType,
      }));

      const resultData = {
        currentIndex,
        entries: formattedEntries,
        totalEntries: formattedEntries.length,
      };

      return createSuccessResponse(resultData);
    } catch (error: any) {
      return createErrorResponse(`Failed to get history: ${error.message}`);
    }
  }

  private async _searchHistory(args: Record<string, any>, cdpClient: CDPClient): Promise<ToolResult> {
    /**
     * Search history
     */
    try {
      const query = (args.text || '').toLowerCase();
      const limit = args.maxResults || 100;

      if (!query) {
        return createErrorResponse('Search keyword cannot be empty');
      }

      // Use CDP native method to get navigation history
      const cdp = cdpClient.cdpSession!;
      const historyResult: any = await cdp.send('Page.getNavigationHistory');

      const entries = historyResult.entries || [];
      const currentIndex = historyResult.currentIndex || 0;

      // Search for matching entries
      const matchedEntries: any[] = [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        // Search in URL and title
        const url = (entry.url || '').toLowerCase();
        const title = (entry.title || '').toLowerCase();

        if (!query || url.includes(query) || title.includes(query)) {
          matchedEntries.push({
            index: i,
            id: entry.id,
            url: entry.url,
            title: entry.title,
            userTypedURL: entry.userTypedURL || null,
            transitionType: entry.transitionType,
          });

          // Limit the number of returned entries
          if (matchedEntries.length >= limit) {
            break;
          }
        }
      }

      const resultData = {
        query,
        currentIndex,
        totalMatches: matchedEntries.length,
        entries: matchedEntries,
      };

      return createSuccessResponse(resultData);
    } catch (error: any) {
      return createErrorResponse(`Failed to search history: ${error.message}`);
    }
  }

  private async _clearHistory(args: Record<string, any>): Promise<ToolResult> {
    /**
     * Clear history
     */
    try {
      // CDP protocol does not provide native method to clear browser history
      // Can only be implemented through Chrome Extension API (chrome.history)
      return createErrorResponse(
        'CDP protocol does not support clearing browser history. ' +
          'This operation requires Chrome Extension API (chrome.history) to complete. ' +
          'Please use this feature in Chrome extension environment.'
      );
    } catch (error: any) {
      return createErrorResponse(`Failed to clear history: ${error.message}`);
    }
  }

  private async _deleteHistoryItem(args: Record<string, any>): Promise<ToolResult> {
    /**
     * Delete specific history item
     */
    try {
      const url = args.url || '';

      if (!url) {
        return createErrorResponse('URL cannot be empty');
      }

      // CDP protocol does not provide native method to delete specific history item
      // Can only be implemented through Chrome Extension API (chrome.history)
      return createErrorResponse(
        'CDP protocol does not support deleting specific history items. ' +
          'This operation requires Chrome Extension API (chrome.history) to complete. ' +
          'Please use this feature in Chrome extension environment.'
      );
    } catch (error: any) {
      return createErrorResponse(`Failed to delete history item: ${error.message}`);
    }
  }
}

export class SessionHistoryTool extends BaseBrowserToolExecutor {
  protected name: string = 'chrome_session_history';

  async execute(args: Record<string, any>): Promise<ToolResult> {
    /**
     * Execute session history operations (CDP protocol)
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
      const action = args.action || 'back';

      if (action === 'back') {
        const history: any = await cdp.send('Page.getNavigationHistory');
        const currentIndex = history.currentIndex || 0;
        if (currentIndex > 0) {
          const entryId = history.entries[currentIndex - 1].id;
          await cdp.send('Page.navigateToHistoryEntry', { entryId });
          return createSuccessResponse('Navigated back to previous page');
        } else {
          return createErrorResponse('No previous page to go back to');
        }
      } else if (action === 'forward') {
        const history: any = await cdp.send('Page.getNavigationHistory');
        const currentIndex = history.currentIndex || 0;
        const entries = history.entries || [];
        if (currentIndex < entries.length - 1) {
          const entryId = entries[currentIndex + 1].id;
          await cdp.send('Page.navigateToHistoryEntry', { entryId });
          return createSuccessResponse('Navigated forward to next page');
        } else {
          return createErrorResponse('No next page to go forward to');
        }
      } else if (action === 'go') {
        const index = args.index || 0;
        const history: any = await cdp.send('Page.getNavigationHistory');
        const entries = history.entries || [];
        if (index >= 0 && index < entries.length) {
          const entryId = entries[index].id;
          await cdp.send('Page.navigateToHistoryEntry', { entryId });
          return createSuccessResponse(`Navigated to history index ${index}`);
        } else {
          return createErrorResponse(`Invalid history index: ${index}`);
        }
      } else if (action === 'get_entries' || action === 'get') {
        const history: any = await cdp.send('Page.getNavigationHistory');
        const entries = (history.entries || []).map((entry: any, i: number) => ({
          index: i,
          id: entry.id,
          url: entry.url,
          title: entry.title,
          userTypedURL: entry.userTypedURL || null,
          transitionType: entry.transitionType,
        }));
        return createSuccessResponse({
          currentIndex: history.currentIndex,
          entries,
        });
      } else {
        return createErrorResponse(`Unknown session history action: ${action}`);
      }
    } catch (error: any) {
      return createErrorResponse(`Session history operation failed: ${error.message}`);
    }
  }
}
