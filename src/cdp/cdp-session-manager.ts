import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TextContent } from '@modelcontextprotocol/sdk/types';
import { BrowserEnv } from './browser-env';
import { CDPClient } from './cdp-client';
import { createToolInstance } from './tools';
import { BaseBrowserToolExecutor } from './tools/base-tool';

export class CdpSessionManager {
  // 缓存已连接的浏览器环境
  private browserEnvs: Map<string, BrowserEnv> = new Map();
  private toolInstances: Map<string, BaseBrowserToolExecutor> = new Map();
  private storageBaseDir: string;

  constructor(storagePath?: string) {
    this.storageBaseDir = CdpSessionManager.resolveWritableDir(storagePath);
    console.error(`[CDP Manager] Using storageBaseDir: ${this.storageBaseDir}`);
  }

  /**
   * 逐级尝试候选目录，返回第一个真正可写的路径。
   * 在 Cherry Studio / Claude Desktop 等 Electron 宿主中，TEMP 和 homedir
   * 都可能因沙箱限制而不可写，因此需要多个兜底路径。
   */
  private static resolveWritableDir(preferred?: string): string {
    const candidates: (string | undefined)[] = [
      preferred,
      // APPDATA / LOCALAPPDATA 通常在 Windows Electron 宿主中可写
      process.env.APPDATA  ? path.join(process.env.APPDATA,  'dicloak-mcp') : undefined,
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'dicloak-mcp') : undefined,
      // 用户主目录
      path.join(os.homedir(), '.dicloak-mcp'),
      // 进程工作目录
      path.join(process.cwd(), '.dicloak-mcp'),
      // 包安装目录（__dirname 指向 dist/，往上两级是包根）
      path.join(path.dirname(path.dirname(__dirname)), '.dicloak-mcp'),
      // 系统临时目录（最后兜底）
      path.join(os.tmpdir(), 'dicloak-mcp'),
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        fs.mkdirSync(candidate, { recursive: true });
        // 真正测试写权限
        const testFile = path.join(candidate, '.write-test');
        fs.writeFileSync(testFile, 'ok');
        fs.unlinkSync(testFile);
        console.error(`[CDP Manager] Writable dir found: ${candidate}`);
        return candidate;
      } catch {
        console.error(`[CDP Manager] Dir not writable, skipping: ${candidate}`);
      }
    }

    // 实在找不到可写目录，返回 tmpdir 并警告
    console.error('[CDP Manager] Warning: no writable dir found, falling back to os.tmpdir()');
    return os.tmpdir();
  }

  /**
   * 获取 CDP 客户端供 Tools 使用
   * Tools 会调用此方法
   */
  getCdpClient(envId: string): CDPClient | null {
    console.error(`[CDP Manager] browserEnvs keys: ${Array.from(this.browserEnvs.keys()).join(', ')}, requested envId: ${envId}`);
    const env = this.browserEnvs.get(envId);
    return env ? env.getCdpClient() : null;
  }

  /**
   * Get or create tool instance
   */
  private getToolInstance(toolName: string): BaseBrowserToolExecutor | null {
    if (!this.toolInstances.has(toolName)) {
      try {
        const instance = createToolInstance(toolName);
        // Set the callback to get CDP client by envId
        instance.setCdpClientCallback((envId: string) =>
          this.getCdpClient(envId)
        );
        this.toolInstances.set(toolName, instance);
      } catch (error: any) {
        console.error(
          `Failed to create tool instance for ${toolName}: ${error.message}`
        );
        return null;
      }
    }
    return this.toolInstances.get(toolName) || null;
  }

  /**
   * 连接到已启动的环境
   * 当 bridge 启动环境成功后，或者检测到环境已运行时调用此方法
   */
  async connectToEnv(envId: string, cdpUrl: string, wsUrl?: string): Promise<boolean> {
    if (this.browserEnvs.has(envId)) {
      return true; // 已连接
    }

    console.error(`[CDP Manager] Connecting to env ${envId}...`);
    // 复用 BrowserEnv 的连接逻辑，传入 storageBaseDir 以便在受限环境（如 Cherry Studio）下覆盖临时目录
    const env = new BrowserEnv(envId, 'unknown', 0, cdpUrl, this.storageBaseDir, wsUrl);

    var retryCount = 5;
    var connectResult: any = {success: false};
    while (retryCount > 0) {
      connectResult = await env.connectCDP();
      if (connectResult.success) {
          break;
      }
      console.warn(`[Controller] Failed to connect to CDP, retries left: ${retryCount - 1}, message: ${connectResult.message}`);
      retryCount--;
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retry
    }
    if (!connectResult.success) {
      return false;
    }

    console.error(`[CDP Manager] Connected to env ${envId} successfully.`);
    this.browserEnvs.set(envId, env);
    console.error(`[CDP Manager] Current connected envs: ${Array.from(this.browserEnvs.keys()).join(', ')}`);
    return true;
  }

  /**
   * 断开连接
   */
  async disconnectEnv(envId: string) {
    const env = this.browserEnvs.get(envId);
    if (env) {
      await env.close();
      this.browserEnvs.delete(envId);
    }
  }

  /**
   * 执行 CDP 工具的核心逻辑
   */
  async executeCdpTool(toolName: string, args: Record<string, any>) {
    try {
      const envId = args.envId || '';

      if (!envId) {
        return {
          content: [{ type: 'text', text: 'Error: envId is required.' }],
          isError: true,
        };
      }

      // Check EnvID validity - only allow numeric characters
      if (!/^\d+$/.test(envId)) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Invalid envId format. envId must contain only numeric characters, but got: ${envId}. Please ensure you are using the correct environment ID which was retrieved from start_browser.`,
            } as TextContent,
          ],
          isError: true,
        };
      }

      // CdpSessionManager 获取连接状态
      let cdpClient = this.getCdpClient(envId);

      if (!cdpClient) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: CDP client not connected for environment ${envId}. Please ensure the environment is started and connected.`,
            },
          ],
          isError: true,
        };
      }

      // 获取工具实例
      const toolInstance = this.getToolInstance(toolName);
      if (!toolInstance) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Tool instance not found for ${toolName}`,
            },
          ],
          isError: true,
        };
      }

      // [特殊处理]：截图工具需要保存路径
      if (toolName === 'take_screenshot') {
        args['folder'] = this.getScreenshotFolder(envId);
      }

      console.error(`Executing CDP tool: ${toolName} with args:`, args);
      const result = await toolInstance.execute(args);

      // 格式化返回结果给 MCP Client
      const content: any[] = [];

      // Format return result
      let responseText: string;
      if (result.isError) {
        responseText = `${toolName} execution failed\n\n`;
      } else {
        responseText = `${toolName} executed successfully\n\n`;
      }

      // Handle content
      for (const contentItem of result.content) {
        if (contentItem.type === 'text') {
          responseText += contentItem.text || '';
        } else if (contentItem.type === 'object' && contentItem.result) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(contentItem.result, null, 2),
              } as TextContent,
            ],
          };
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: responseText,
          } as TextContent,
        ],
        isError: result.isError,
      };
    } catch (error: any) {
      const errorMsg = `Error executing CDP tool ${toolName}: ${error.message}`;
      console.error(errorMsg);
      return {
        content: [
          {
            type: 'text',
            text: errorMsg,
          } as TextContent,
        ],
        isError: true,
      };
    }
  }

  // 辅助方法：截图保存路径
  private getScreenshotFolder(envId: string): string {
    const path = require('path');
    const fs = require('fs');
    
    const folder = path.join(this.storageBaseDir, 'dicloak_screenshots', envId);
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
    return folder;
  }
}
