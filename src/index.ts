#!/usr/bin/env node
console.error(`[DEBUG] Running from: ${__dirname}`);
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { OpenAPIV3 } from 'openapi-types';
import { RpaProcess } from './rpa-mapping.js';
import { buildInputSchema } from './openapi-utils.js';
import merge from 'lodash.merge';
import openApiSpecRaw from '../dicloak-openapi-en.json'; 

// cdp imports
import { CdpSessionManager } from './cdp/cdp-session-manager';
import { TOOL_CLASSES } from './cdp/tools';
import { CDP_TOOL_SCHEMAS } from './cdp/tools/tool-definitions';


type OpenAPISpec = OpenAPIV3.Document;

class DicloakHybridServer {
  private server: Server;
  private apiSpec: OpenAPISpec | null = null; // 最终的、渲染过的规范
  private baseUrl: string = '';
  private apiToken?: string;
  private cdpManager: CdpSessionManager;

  constructor(config?: any) {
    let storagePath: string | undefined;
    if (config) {
      this.apiToken = config.DICLOAK_API_KEY;
      this.baseUrl = config.DICLOAK_BASE_URL;
      storagePath = config.DICLOAK_STORAGE_PATH;
    } else {
      this.apiToken = process.env.DICLOAK_API_KEY;
      this.baseUrl = process.env.DICLOAK_BASE_URL!;
      storagePath = process.env.DICLOAK_STORAGE_PATH;
    }

    this.cdpManager = new CdpSessionManager(storagePath);

    if (!this.apiToken) {
      throw new Error("The environment variable 'DICLOAK_API_KEY' is not set.");
    }
    if (!this.baseUrl) {
      throw new Error(
        "The environment variable 'DICLOAK_BASE_URL' is not set."
      );
    }
    this.server = new Server(
      {
        name: 'dicloak-hybrid-bridge',
        version: '1.1.3',
      },
      { capabilities: { tools: {} } }
    );
  }

  // 动态工具生成
  private async loadAndGenerateTools(): Promise<void> {
    // rpa-mapping.ts 生成高级 RPA 工具
    const { RPA_MAPPING } = await import('./rpa-mapping.js');
    const dynamicRpaTools: Tool[] = RPA_MAPPING.map((rpaProcess) => {
      if (rpaProcess.toolName.length >= 31) {
        console.error(`⚠️ 警告: 工具名称过长 (${rpaProcess.toolName.length} chars): ${rpaProcess.toolName}`);
      }
      return {
        name: rpaProcess.toolName,
        description: rpaProcess.summary,
        inputSchema: rpaProcess.inputSchema,
      };
    });

    // cdp 工具生成
    const cdpTools = Object.keys(TOOL_CLASSES).map(toolName => {
      const schema = CDP_TOOL_SCHEMAS[toolName];
      
      if (!schema) {
        console.warn(`Warning: No schema found for tool ${toolName}`);
        return null;
      }

      return {
        name: toolName,
        description: schema.description,
        inputSchema: schema.inputSchema,
      };
    }).filter(Boolean);

    // dicloak-openapi.json 生成基础原子工具
    const specContent = JSON.stringify(openApiSpecRaw);
    const finalSpecContent = specContent.replace(
      '{{DICLOAK_BASE_URL}}',
      this.baseUrl
    );
    this.apiSpec = JSON.parse(finalSpecContent) as OpenAPISpec;

    const baseTools: Tool[] = [];
    if (this.apiSpec && this.apiSpec.paths) {
      for (const [pathTemplate, pathItem] of Object.entries(
        this.apiSpec.paths
      )) {
        if (!pathItem) continue;
        for (const [method, op] of Object.entries(pathItem)) {
          if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
            const operation = op as OpenAPIV3.OperationObject;
            if (!operation.operationId) continue;

            // 使用 util 生成已展开的 inputSchema（会把 requestBody/path/query 合并）
            const inputSchema = buildInputSchema(
              this.apiSpec,
              operation,
              pathTemplate
            );

            // 尝试从 requestBody 中提取 examples.full 或 schema.x-full-default-template 用于提示
            let fullTemplate: any | undefined;
            try {
              const rb =
                (operation.requestBody as any)?.content?.['application/json'] ??
                (operation.requestBody as any)?.content?.['*/*'];
              if (rb && rb.examples && rb.examples.full && rb.examples.full.value) {
                fullTemplate = rb.examples.full.value;
              } else {
                // try vendor extension from schema reference
                const schemaRef = rb?.schema;
                if (schemaRef && schemaRef.$ref && this.apiSpec?.components) {
                  const refPath = schemaRef.$ref.replace(/^#\//, '').split('/');
                  let node: any = this.apiSpec;
                  for (const p of refPath) {
                    node = node ? node[p] : null;
                  }
                  if (node && node['x-full-default-template']) {
                    fullTemplate = node['x-full-default-template'];
                  }
                }
              }
            } catch {
              fullTemplate = undefined;
            }

            // Build description: include full template snippet if available to help LLMs
            let description =
              operation.summary ||
              operation.description ||
              `${method.toUpperCase()} ${pathTemplate}`;
            if (fullTemplate) {
              description +=
                `\n\nIMPORTANT: Server requires a complete request body. ` +
                `Full template (use as-is, replace required fields like name, browser, group_id):\n` +
                `${JSON.stringify(fullTemplate, null, 2)}`;
            }

            const tool: Tool = {
              name: operation.operationId,
              description,
              inputSchema: inputSchema,
            };

            // 调试：打印每个注册工具的简短信息，便于在客户端验证
            // console.error(
            //   `Registering tool: ${tool.name} (${method.toUpperCase()} ${pathTemplate})`
            // );
            // console.error(
            //   `  inputSchema.properties: ${Object.keys(
            //     tool.inputSchema.properties || {}
            //   ).join(', ')}`
            // );
            if (fullTemplate) console.error(`  fullTemplate: ${JSON.stringify(fullTemplate).slice(0, 400)}...`);

            baseTools.push(tool);
          }
        }
      }
    }

    // --- 第三部分：手动添加其他特殊工具 ---
    // const specialTools: Tool[] = [ ... ];

    // --- 第四部分：合并所有工具 ---
    const allTools = [...dynamicRpaTools, ...baseTools, ...cdpTools /*, ...specialTools */];

    // 设置 ListTools 处理器
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: allTools,
    }));
  }

  // 动态工具调用
  private async setupCallToolHandler(): Promise<void> {
    // 准备 RPA 工具的查找映射
    const { RPA_MAPPING } = await import('./rpa-mapping.js');
    const toolNameToRpaProcessMap = new Map<string, RpaProcess>();
    RPA_MAPPING.forEach((p) => toolNameToRpaProcessMap.set(p.toolName, p));

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: any): Promise<CallToolResult> => {
        const { name: toolName, arguments: args } = request.params;

        // console.error('调用工具:', toolName, '参数:', args);

        // 优先级 1: 检查是否是 CDP 工具
        if (toolName in TOOL_CLASSES) {
          const result = await this.cdpManager.executeCdpTool(toolName, args);
          // console.error(`Tool ${toolName} executed. result: ${JSON.stringify(result)}`);
          return result as CallToolResult;
        }

        // 优先级 2: 检查是否是高级 RPA 工具
        const rpaProcess = toolNameToRpaProcessMap.get(toolName);
        if (rpaProcess) {
          const { env_ids, run_timeout, is_cancel_close, ...input_data } = args;
          const payload = {
            flow_id: rpaProcess.id,
            env_ids,
            run_timeout,
            is_cancel_close,
            input_data,
          };

          const response = await fetch(
            `${this.baseUrl}/v1/rpa/create_automa_flow_and_run`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': this.apiToken!,
              },
              body: JSON.stringify(payload),
            }
          );

          const responseText = await this.formatResponse(response);
          return {
            content: [
              { type: 'text', text: `The RPA process has been triggered for execution. It usually takes several minutes or even longer to retrieve the results...., ${responseText}` },
            ],
          };
        }

        // --- 优先级 3: 检查是否是基础原子工具 ---
        try {
          const { method, path, operation } =
            this.findEndpointByToolName(toolName);

          // buildFetchOptions now performs prefill of full-template if available
          const fetchOptions = this.buildFetchOptions(
            method,
            path,
            operation,
            args
          );

          // Debug: log final outgoing body for troubleshooting
          console.error('Outgoing request:', fetchOptions.method, fetchOptions.url);
          try {
            console.error('Outgoing headers:', JSON.stringify((fetchOptions.options.headers || {})));
            if (fetchOptions.options.body) {
              const bodyPreview = String(fetchOptions.options.body).slice(0, 2000);
              console.error('Outgoing body preview:', bodyPreview);
            }
          } catch {}

          const response = await fetch(fetchOptions.url, fetchOptions.options);
          const json: any = await response.json();
          let cdpConnect = false;

          // 如果是 openEnv，则尝试连接 CDP
          const { envId } = args || {};
          
          if (toolName === 'openEnv' && envId && json && json.data && json.data.debug_port) {
            const cdpUrl = `http://localhost:${json.data.debug_port}`;
            // 优先使用 API 返回的 web_socket_url 直连，避免 Playwright HTTP 探测 400 问题
            const wsUrl: string | undefined = json.data.web_socket_url || undefined;
            cdpConnect = await this.cdpManager.connectToEnv(envId, cdpUrl, wsUrl);
          } else if (toolName === 'closeEnv' && envId) {
            // 断开 CDP 连接，删除实例
            await this.cdpManager.disconnectEnv(envId); 
            cdpConnect = false;
          }

          const responseText = await this.formatResponse(response, json);
          // console.error(`Tool ${toolName} executed. CDP connected: ${cdpConnect}`);
          return { content: [{ type: 'text', text: responseText, cdpConnect }] };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
          };
        }
      }
    );
  }

  private buildInputSchema(operation: OpenAPIV3.OperationObject): any {
    const properties: any = {};
    const required: string[] = [];

    // 遍历所有参数 (path, query, header, cookie)
    if (operation.parameters) {
      for (const param of operation.parameters) {
        const p = param as OpenAPIV3.ParameterObject;
        if (p.in === 'path' || p.in === 'query') {
          properties[p.name] = p.schema || { type: 'string' };
          if (p.description) {
            properties[p.name].description = p.description;
          }
          if (p.required) {
            required.push(p.name);
          }
        }
      }
    }

    // 处理请求体
    if (operation.requestBody) {
      const body = operation.requestBody as OpenAPIV3.RequestBodyObject;
      const schema = body.content['application/json']
        ?.schema as OpenAPIV3.SchemaObject;
      if (schema && schema.properties) {
        for (const [key, prop] of Object.entries(schema.properties)) {
          properties[key] = prop;
        }
        if (schema.required) {
          required.push(...schema.required);
        }
      }
    }

    return {
      type: 'object',
      properties,
      required: [...new Set(required)],
    };
  }

  /**
   * 根据 operationId 在 apiSpec 中反向查找对应的 API 端点信息。
   */
  private findEndpointByToolName(toolName: string): {
    method: string;
    path: string;
    operation: OpenAPIV3.OperationObject;
  } {
    if (!this.apiSpec || !this.apiSpec.paths) {
      throw new Error('API 规范未加载或为空。');
    }

    for (const [path, pathItem] of Object.entries(this.apiSpec.paths)) {
      if (!pathItem) continue;
      for (const [method, op] of Object.entries(pathItem)) {
        if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
          const operation = op as OpenAPIV3.OperationObject;
          if (operation.operationId === toolName) {
            return { method, path, operation };
          }
        }
      }
    }
    throw new Error(`无法为工具 "${toolName}" 找到对应的 API 端点。`);
  }

  /**
   * 根据 API 定义和 AI 提供的参数，构建 fetch 请求所需的 URL 和 options。
   * 同时会尝试 prefill（若 OpenAPI 提供 full template）。
   */
  private buildFetchOptions(
    method: string,
    path: string,
    op: OpenAPIV3.OperationObject,
    args: any
  ): { url: string; options: RequestInit; method: string } {
    let url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'User-Agent': 'Dicloak-MCP-Bridge/1.0',
    };

    // 添加 API Token
    if (this.apiToken) {
      headers['X-API-KEY'] = this.apiToken;
    }

    // 1. 处理路径参数 (Path Parameters)
    if (op.parameters) {
      const pathParams = op.parameters.filter(
        (p) => (p as OpenAPIV3.ParameterObject).in === 'path'
      );
      for (const param of pathParams) {
        const p = param as OpenAPIV3.ParameterObject;
        const argValue = args[p.name];
        if (argValue === undefined)
          throw new Error(`缺少必需的路径参数: ${p.name}`);
        url = url.replace(`{${p.name}}`, encodeURIComponent(argValue));
      }
    }

    // 2. 处理查询参数 (Query Parameters)
    const queryParams = new URLSearchParams();
    if (op.parameters) {
      const queryParamList = op.parameters.filter(
        (p) => (p as OpenAPIV3.ParameterObject).in === 'query'
      );
      for (const param of queryParamList) {
        const p = param as OpenAPIV3.ParameterObject;
        if (args[p.name] !== undefined) {
          queryParams.append(p.name, args[p.name]);
        }
      }
    }
    if (queryParams.toString()) {
      url += `?${queryParams.toString()}`;
    }

    // 3. 处理请求体 (Request Body)
    let body: string | undefined;
    if (op.requestBody) {
      headers['Content-Type'] = 'application/json';
      // 所有非路径/查询参数都属于 body
      const bodyArgs: Record<string, any> = {};
      const knownParams = new Set(
        op.parameters?.map((p) => (p as OpenAPIV3.ParameterObject).name) || []
      );

      // Accept both direct fields and a single 'body' object from the LLM
      if (args && typeof args === 'object' && args.body && typeof args.body === 'object') {
        // if LLM passed a top-level 'body', use it
        Object.assign(bodyArgs, args.body);
      } else {
        for (const key in args) {
          if (!knownParams.has(key)) {
            bodyArgs[key] = args[key];
          }
        }
      }

      // Try to find a full template from operation.requestBody.examples.full or from the referenced schema's x-full-default-template
      let fullTemplate: any | undefined;
      try {
        const rb =
          (op.requestBody as any)?.content?.['application/json'] ??
          (op.requestBody as any)?.content?.['*/*'];
        if (rb && rb.examples && rb.examples.full && rb.examples.full.value) {
          fullTemplate = rb.examples.full.value;
        } else {
          const schemaRef = rb?.schema;
          if (schemaRef && schemaRef.$ref && this.apiSpec?.components) {
            const refPath = schemaRef.$ref.replace(/^#\//, '').split('/');
            let node: any = this.apiSpec;
            for (const p of refPath) {
              node = node ? node[p] : null;
            }
            if (node && node['x-full-default-template']) {
              fullTemplate = node['x-full-default-template'];
            }
          }
        }
      } catch (e) {
        console.error('Error while extracting full template:', e);
      }

      // Merge template <- userProvided to ensure server receives a complete payload
      let finalBodyObj: any;
      if (fullTemplate && typeof fullTemplate === 'object') {
        finalBodyObj = merge({}, fullTemplate, bodyArgs);
      } else {
        finalBodyObj = bodyArgs;
      }

      // Final body string
      body = JSON.stringify(finalBodyObj);
    }

    const options: RequestInit = {
      method: method.toUpperCase(),
      headers,
      body,
    };

    return { url, options, method: method.toUpperCase() };
  }

  /**
   * 将 fetch 的 Response 对象格式化为对 AI 和用户友好的文本。
   */
  private async formatResponse(response: Response, json?: any): Promise<string> {
    let responseBodyText: string;
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        const _json = json || await response.json();
        responseBodyText = JSON.stringify(_json, null, 2);
      } catch {
        responseBodyText = '[Unable to parse JSON response]';
      }
    } else {
      responseBodyText = await response.text();
    }

    if (response.ok) {
      return `✅ Operation successful (Status code: ${response.status}). \n response:\n${
        responseBodyText || '[no content]'
      }`;
    } else {
      return `❌ Operation failed (Status code: ${response.status} ${
        response.statusText
      }).\nError details:\n${responseBodyText || '[no content]'}`;
    }
  }

  public async run(): Promise<void> {
    try {
      await this.loadAndGenerateTools();
      await this.setupCallToolHandler();

      const transport = new StdioServerTransport();
      await this.server.connect(transport);
    } catch (err: any) {
      console.error('❌ 服务器启动或运行期间发生致命错误:', err.message);
      process.exit(1);
    }
  }
}

const server = new DicloakHybridServer();
server.run().catch(console.error);