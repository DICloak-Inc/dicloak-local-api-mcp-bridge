/**
 * Browser Environment
 * 
 * Encapsulates browser environment information and CDP connection
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { chromium, Browser, BrowserContext, Page } from 'playwright-core';
import { CDPClient } from './cdp-client';

export class BrowserEnv {
  public envId: string;
  public name: string;
  public serialNumber: number;
  
  private cdpUrl: string;
  private wsUrl: string | undefined;
  private storagePath: string | undefined;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private currentPage: Page | null = null;
  private cdpClient: CDPClient | null = null;

  constructor(envId: string, name: string, serialNumber: number, cdpUrl: string, storagePath?: string, wsUrl?: string) {
    this.envId = envId;
    this.name = name;
    this.serialNumber = serialNumber;
    this.cdpUrl = cdpUrl;
    this.storagePath = storagePath;
    // 规范化 ws URL：将 0.0.0.0 替换为 127.0.0.1（0.0.0.0 作为客户端目标地址无效）
    this.wsUrl = wsUrl ? wsUrl.replace('ws://0.0.0.0', 'ws://127.0.0.1') : undefined;
  }

  /**
   * Connect to CDP
   */
  async connectCDP(): Promise<{ success: boolean; message?: string }> {
    if (!this.cdpUrl) {
      return { success: false, message: 'CDP URL not available' };
    }

    // Playwright's connectOverCDP internally calls os.tmpdir() + fs.mkdtemp to create
    // an artifacts directory. In sandboxed Electron hosts (Cherry Studio, Claude Desktop)
    // the inherited TEMP/TMP may point to a non-writable location causing EPERM.
    // Fix: find the first actually-writable directory, then BOTH override env vars AND
    // monkey-patch os.tmpdir() (playwright calls it directly, not via env vars).
    const writableTmpDir = this.findWritableTmpDir();
    const savedEnv: Record<string, string | undefined> = {};
    const originalTmpdir = os.tmpdir.bind(os);

    if (writableTmpDir) {
      for (const key of ['TEMP', 'TMP', 'TMPDIR']) {
        savedEnv[key] = process.env[key];
        process.env[key] = writableTmpDir;
      }
      // Also patch os.tmpdir() itself — playwright calls it directly rather than reading env vars.
      // Use Object.defineProperty because in some Node.js builds tmpdir is a getter-only property,
      // and a plain assignment would throw "Cannot set property ... which has only a getter".
      try {
        Object.defineProperty(os, 'tmpdir', {
          value: () => writableTmpDir,
          configurable: true,
          writable: true,
        });
      } catch (e: any) {
        // Non-fatal: env var override alone may still work on Windows
        console.error(`[BrowserEnv ${this.envId}] Could not patch os.tmpdir (non-fatal): ${e.message}`);
      }
      console.error(`[BrowserEnv ${this.envId}] Redirecting playwright tmp to: ${writableTmpDir}`);
    } else {
      console.error(`[BrowserEnv ${this.envId}] Warning: no writable tmp dir found, playwright may fail with EPERM`);
    }

    try {
      // 优先使用 wsUrl 直连，跳过 Playwright 内部的 HTTP /json/version/ 探测（该探测可能返回 400）
      const connectTarget = this.wsUrl ?? this.cdpUrl;
      console.error(`[BrowserEnv ${this.envId}] Connecting to CDP: ${connectTarget}`);
      
      // Connect via Playwright
      this.browser = await chromium.connectOverCDP(connectTarget);
      
      // Get default context
      const contexts = this.browser.contexts();
      if (contexts.length === 0) {
        return { success: false, message: 'No browser context available' };
      }
      
      this.context = contexts[0];
      
      // Get or create page
      const pages = this.context.pages();
      if (pages.length > 0) {
        this.currentPage = pages[0];
      } else {
        this.currentPage = await this.context.newPage();
      }

      // Create CDP client
      this.cdpClient = await CDPClient.create(this.currentPage);

      console.error(`[BrowserEnv ${this.envId}] CDP connection established successfully`);
      return { success: true };
    } catch (error: any) {
      console.error(`[BrowserEnv ${this.envId}] Failed to connect to CDP: ${error.message}`);
      return { success: false, message: error.message };
    } finally {
      // Restore env vars and os.tmpdir regardless of success or failure
      if (writableTmpDir) {
        for (const key of ['TEMP', 'TMP', 'TMPDIR']) {
          if (savedEnv[key] !== undefined) {
            process.env[key] = savedEnv[key];
          } else {
            delete process.env[key];
          }
        }
        try {
          Object.defineProperty(os, 'tmpdir', {
            value: originalTmpdir,
            configurable: true,
            writable: true,
          });
        } catch { /* ignore */ }
      }
    }
  }

  /**
   * 逐个尝试候选目录，返回第一个真正可写的路径。
   * 需要覆盖尽可能多的候选，因为在不同的 Electron 宿主（Cherry Studio、Claude Desktop）
   * 中受限的路径各不相同。
   */
  private findWritableTmpDir(): string | undefined {
    const candidates: (string | undefined)[] = [
      // 1. 用户配置的 storagePath
      this.storagePath ? path.join(this.storagePath, 'playwright-tmp') : undefined,
      // 2. Windows Roaming AppData（Electron 宿主通常允许写入）
      process.env.APPDATA ? path.join(process.env.APPDATA, 'dicloak-mcp', 'tmp') : undefined,
      // 3. Windows Local AppData
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'dicloak-mcp', 'tmp') : undefined,
      // 4. 用户主目录
      path.join(os.homedir(), '.dicloak-mcp', 'tmp'),
      // 5. 进程工作目录
      path.join(process.cwd(), '.dicloak-mcp', 'tmp'),
      // 6. 包安装目录（__dirname 指向 dist/，往上两级是包根）
      path.join(__dirname, '..', '..', '.dicloak-mcp', 'tmp'),
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        fs.mkdirSync(candidate, { recursive: true });
        const testFile = path.join(candidate, '.write-test');
        fs.writeFileSync(testFile, 'ok');
        fs.unlinkSync(testFile);
        return candidate;
      } catch (e: any) {
        console.error(`[BrowserEnv ${this.envId}] tmp candidate not writable (${candidate}): ${e.message}`);
      }
    }
    return undefined;
  }

  /**
   * Get CDP client
   */
  getCdpClient(): CDPClient | null {
    return this.cdpClient;
  }

  /**
   * Get current page
   */
  getEnvPage(): Page | null {
    return this.currentPage;
  }

  /**
   * Get browser context
   */
  getEnvCdpContext(): BrowserContext | null {
    return this.context;
  }

  /**
   * Get CDP URL
   */
  getCdpUrl(): string {
    return this.cdpUrl;
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    try {
      if (this.currentPage) {
        await this.currentPage.close().catch(() => {});
        this.currentPage = null;
      }

      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }

      this.context = null;
      this.cdpClient = null;
      
      console.error(`[BrowserEnv ${this.envId}] Closed successfully`);
    } catch (error: any) {
      console.error(`[BrowserEnv ${this.envId}] Failed to close: ${error.message}`);
      throw error;
    }
  }
}
