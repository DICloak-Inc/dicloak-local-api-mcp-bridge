/**
 * Chrome CDP Tools Index
 */

import { BaseBrowserToolExecutor } from './base-tool';
import { WindowTool, NavigateTool, CloseTabsTool, HistoryNavigationTool, SwitchTabTool } from './window-tool';
import { ScreenshotTool } from './screenshot-tool';
import { ConsoleTool } from './console-tool';
import { HistorySearchTool, SessionHistoryTool } from './history-tool';
import { InjectScriptTool, ScriptLibraryTool, SendCommandToInjectScriptTool } from './inject-script-tool';
import { ClickTool, FillTool, InteractiveElementsTool } from './interaction-tool';
import { KeyboardTool } from './keyboard-tool';
import { NetworkRequestTool, NetworkCaptureStartTool, NetworkCaptureStopTool } from './network-tool';
import { WebFetcherTool, ElementAttributesTool } from './web-fetcher-tool';
import { MouseTool } from './mouse-tool';

export const TOOL_CLASSES: Record<string, new () => BaseBrowserToolExecutor> = {
  // Window and navigation management
  'get_windows_and_tabs': WindowTool,
  'navigate': NavigateTool,
  'switch_tab': SwitchTabTool,
  'close_tabs': CloseTabsTool,
  'go_back_or_forward': HistoryNavigationTool,

  // Screenshot tool
  'take_screenshot': ScreenshotTool,

  // Console tool
  'chrome_console': ConsoleTool,

  // History tools
  'chrome_history': HistorySearchTool,
  'chrome_session_history': SessionHistoryTool,

  // Script injection tools
  'chrome_inject_script': InjectScriptTool,
  'chrome_script_library': ScriptLibraryTool,
  'chrome_send_command_to_inject_script': SendCommandToInjectScriptTool,

  // Interaction tools
  'chrome_click_element': ClickTool,
  'chrome_fill_or_select': FillTool,
  'chrome_get_interactive_elements': InteractiveElementsTool,

  // Keyboard tool
  'chrome_keyboard': KeyboardTool,

  // Mouse and touch control tool
  'chrome_mouse_control': MouseTool,

  // Network tools
  'chrome_network_request': NetworkRequestTool,
  'chrome_network_capture_start': NetworkCaptureStartTool,
  'chrome_network_capture_stop': NetworkCaptureStopTool,

  // Web content fetcher
  'chrome_get_web_content': WebFetcherTool,
  // Element attributes tool
  'chrome_get_element_attributes': ElementAttributesTool,
};

export function getAvailableTools(): string[] {
  return Object.keys(TOOL_CLASSES);
}

export function createToolInstance(toolName: string): BaseBrowserToolExecutor {
  const ToolClass = TOOL_CLASSES[toolName];
  if (!ToolClass) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  return new ToolClass();
}

export * from './base-tool';
export * from './window-tool';
export * from './screenshot-tool';
export * from './console-tool';
export * from './history-tool';
export * from './inject-script-tool';
export * from './interaction-tool';
export * from './keyboard-tool';
export * from './network-tool';
export * from './web-fetcher-tool';
export * from './mouse-tool';
