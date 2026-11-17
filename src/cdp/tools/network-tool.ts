/**
 * Network Operations Tool
 *
 * Handle network request interception, monitoring and operations
 */

import { BaseBrowserToolExecutor, ToolResult, createErrorResponse, createSuccessResponse } from './base-tool';

export class NetworkRequestTool extends BaseBrowserToolExecutor {
  /**
   * CDP-based tool to send network requests with custom method, headers, body, and timeout.
   */
  protected name: string = 'chrome_network_request';

  async execute(args: Record<string, any>): Promise<ToolResult> {
    /**
     * Send a network request via CDP.
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
      const url = args.url;
      const method = (args.method || 'GET').toUpperCase();
      const headers = args.headers || {};
      const body = args.body || null;
      const timeout = args.timeout || 30000;

      if (!url) {
        return createErrorResponse('URL parameter is required.');
      }

      // Prepare request params for CDP
      const requestParams: any = {
        url,
        method,
        headers,
      };
      if (body !== null) {
        // CDP expects postData as string
        if (typeof body === 'object') {
          requestParams.postData = JSON.stringify(body);
        } else {
          requestParams.postData = String(body);
        }
      }

      // Note: CDP doesn't provide a direct way to make arbitrary HTTP requests
      // This is a simplified implementation using Runtime.evaluate with fetch
      const script = `
        (async () => {
          const options = {
            method: '${method}',
            headers: ${JSON.stringify(headers)},
            ${body ? `body: ${JSON.stringify(typeof body === 'object' ? JSON.stringify(body) : body)},` : ''}
          };
          try {
            const response = await fetch('${url}', options);
            const text = await response.text();
            return {
              success: true,
              status: response.status,
              statusText: response.statusText,
              headers: Object.fromEntries(response.headers.entries()),
              body: text,
              url: response.url
            };
          } catch (error) {
            return {
              success: false,
              error: error.message
            };
          }
        })()
      `;
      const result: any = await cdp.send('Runtime.evaluate', {
        expression: script,
        returnByValue: true,
        awaitPromise: true,
      });
      const value = result.result?.value || {};
      if (!value.success) {
        return createErrorResponse(value.error || 'Request failed');
      }
      return createSuccessResponse(value);
    } catch (error: any) {
      return createErrorResponse(`Error sending network request: ${error.message}`);
    }
  }
}

export class NetworkCaptureStartTool extends BaseBrowserToolExecutor {
  /**
   * CDP-based network request capture tool (start).
   */
  protected name: string = 'chrome_network_capture_start';
  private captureData: Record<string, any> = {};
  private isCapturing: boolean = false;
  private maxRequests: number = 1000;
  private requestCount: number = 0;
  private startTime: number | null = null;
  private endTime: number | null = null;
  private requests: any[] = [];
  private tabUrl: string | null = null;
  private tabTitle: string | null = null;
  private inactivityTimeout: number = 60 * 1000;
  private maxCaptureTime: number = 3 * 60 * 1000;
  private includeStatic: boolean = false;
  private lastActivity: number | null = null;
  private inactivityTask: any = null;
  private captureTask: any = null;
  private targetUrl: string | null = null;

  async execute(args: Record<string, any>): Promise<ToolResult> {
    /**
     * Start network capture via CDP.
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

      // Handle URL parameter
      this.targetUrl = args.url || null;
      if (this.targetUrl) {
        // Navigate to the target URL if provided
        try {
          await cdpClient.cdpSession.send('Page.navigate', { url: this.targetUrl });
          // Wait a bit for navigation to start
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error: any) {
          return createErrorResponse(`Failed to navigate to URL ${this.targetUrl}: ${error.message}`);
        }
      }

      const cdp = cdpClient.cdpSession;
      this.maxCaptureTime = args.maxCaptureTime || 3 * 60 * 1000;
      this.inactivityTimeout = args.inactivityTimeout || 60 * 1000;
      this.includeStatic = args.includeStatic || false;
      this.maxRequests = args.maxRequests || 1000;
      this.requestCount = 0;
      this.requests = [];
      this.startTime = Date.now();
      this.lastActivity = this.startTime;
      this.isCapturing = true;

      await cdp.send('Network.enable');

      // Event handlers
      const onRequest = (event: any) => {
        if (!this.isCapturing) return;
        const req = event.request || {};
        const url = req.url;
        if (!this.includeStatic && this._isStaticResource(url)) {
          return;
        }
        if (this.requestCount >= this.maxRequests) {
          this.isCapturing = false;
          return;
        }
        this.requestCount++;
        this.lastActivity = Date.now();
        const entry = {
          timestamp: event.timestamp,
          request_id: event.requestId,
          type: 'request',
          method: req.method,
          url,
          headers: req.headers,
          post_data: req.postData,
          initiator: event.initiator,
          resource_type: event.type,
        };
        this.requests.push(entry);
      };

      const onResponse = (event: any) => {
        if (!this.isCapturing) return;
        const resp = event.response || {};
        const entry = {
          timestamp: event.timestamp,
          request_id: event.requestId,
          type: 'response',
          url: resp.url,
          status: resp.status,
          status_text: resp.statusText || '',
          headers: resp.headers,
          mime_type: resp.mimeType || '',
          resource_type: event.type,
        };
        this.requests.push(entry);
        this.lastActivity = Date.now();
      };

      const onFailed = (event: any) => {
        if (!this.isCapturing) return;
        const entry = {
          timestamp: event.timestamp,
          request_id: event.requestId,
          type: 'error',
          error_text: event.errorText || '',
          canceled: event.canceled || false,
          resource_type: event.type,
        };
        this.requests.push(entry);
        this.lastActivity = Date.now();
      };

      cdp.on('Network.requestWillBeSent', onRequest);
      cdp.on('Network.responseReceived', onResponse);
      cdp.on('Network.loadingFailed', onFailed);

      // Start background tasks for timeouts
      if (this.captureTask) {
        clearTimeout(this.captureTask);
      }
      if (this.inactivityTask) {
        clearTimeout(this.inactivityTask);
      }
      this.captureTask = setTimeout(() => {
        if (this.isCapturing) {
          this.isCapturing = false;
        }
      }, this.maxCaptureTime);

      this.inactivityTask = setInterval(() => {
        if (this.isCapturing && this.lastActivity) {
          const now = Date.now();
          if (now - this.lastActivity >= this.inactivityTimeout) {
            this.isCapturing = false;
            clearInterval(this.inactivityTask);
          }
        }
      }, 1000);

      const resultData: any = {
        success: true,
        message: 'Network capture started (CDP)',
        maxCaptureTime: this.maxCaptureTime,
        inactivityTimeout: this.inactivityTimeout,
        includeStatic: this.includeStatic,
        maxRequests: this.maxRequests,
      };

      // Include URL info in result if provided
      if (this.targetUrl) {
        resultData.targetUrl = this.targetUrl;
      }

      return createSuccessResponse(resultData);
    } catch (error: any) {
      this.isCapturing = false;
      return createErrorResponse(`Failed to start network capture: ${error.message}`);
    }
  }

  private _isStaticResource(url: string | null): boolean {
    if (!url) return false;
    const staticExts = [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.svg',
      '.webp',
      '.ico',
      '.bmp',
      '.css',
      '.scss',
      '.less',
      '.js',
      '.jsx',
      '.ts',
      '.tsx',
      '.woff',
      '.woff2',
      '.ttf',
      '.eot',
      '.otf',
      '.mp3',
      '.mp4',
      '.avi',
      '.mov',
      '.wmv',
      '.flv',
      '.ogg',
      '.wav',
      '.pdf',
      '.doc',
      '.docx',
      '.xls',
      '.xlsx',
      '.ppt',
      '.pptx',
    ];
    const lowerUrl = url.toLowerCase();
    return staticExts.some((ext) => lowerUrl.endsWith(ext));
  }

  // Expose for NetworkCaptureStopTool
  public getIsCapturing(): boolean {
    return this.isCapturing;
  }

  public getCaptureData(): any {
    return {
      requests: this.requests,
      startTime: this.startTime,
      endTime: this.endTime,
      requestCount: this.requestCount,
    };
  }

  public stopCapture(): void {
    this.isCapturing = false;
    this.endTime = Date.now();
    if (this.captureTask) {
      clearTimeout(this.captureTask);
    }
    if (this.inactivityTask) {
      clearInterval(this.inactivityTask);
    }
  }
}

export class NetworkCaptureStopTool extends BaseBrowserToolExecutor {
  /**
   * CDP-based network request capture tool (stop and return results).
   */
  protected name: string = 'chrome_network_capture_stop';
  private startToolInstance: NetworkCaptureStartTool | null = null;

  constructor(startToolInstance?: NetworkCaptureStartTool) {
    super();
    this.startToolInstance = startToolInstance || null;
  }

  async execute(args: Record<string, any> = {}): Promise<ToolResult> {
    /**
     * Stop network capture and return results.
     */
    try {
      const startTool = this.startToolInstance;
      if (!startTool || !startTool.getIsCapturing()) {
        return createErrorResponse('No active network capture session found.');
      }

      // Stop capturing
      startTool.stopCapture();

      // Prepare result data
      const captureData = startTool.getCaptureData();
      const requests = captureData.requests || [];
      const captureStart = captureData.startTime;
      const captureEnd = captureData.endTime;
      const totalDuration = captureStart && captureEnd ? captureEnd - captureStart : null;

      const resultData = {
        success: true,
        message: `Capture complete. ${requests.length} requests captured.`,
        requestCount: requests.length,
        requests,
        captureStartTime: captureStart,
        captureEndTime: captureEnd,
        totalDurationMs: totalDuration,
      };

      return createSuccessResponse(resultData);
    } catch (error: any) {
      return createErrorResponse(`Failed to stop network capture: ${error.message}`);
    }
  }
}
