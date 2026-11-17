/**
 * CDP Tool Definitions
 * Contains description and inputSchema for all CDP tools
 */

export const CDP_TOOL_SCHEMAS: Record<string, any> = {
  'get_windows_and_tabs': {
    description: 'Get all currently opened windows and tabs in the browser environment',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        }
      },
      required: ['envId'],
    },
  },
  'navigate': {
    description: 'Navigate to a URL or refresh the current tab in the browser environment',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        url: {
          type: 'string',
          description: 'URL to navigate to',
        },
        newTab: {
          type: 'boolean',
          description: 'Create a new tab to navigate to the URL or not. Defaults to false',
          default: false,
        },
        width: {
          type: 'number',
          description: 'Viewport width in pixels, skip it if not needed',
        },
        height: {
          type: 'number',
          description: 'Viewport height in pixels, skip it if not needed',
        },
        refresh: {
          type: 'boolean',
          description: 'Refresh the current active tab instead of navigating to a URL. When true, the url parameter is ignored. Defaults to false',
          default: false,
        },
      },
      required: ["envId", "url"],
    },
  },
  'switch_tab': {
    description: 'Switch to a tab in the browser environment by tab ID, title, or URL',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        tabId: {
          type: 'number',
          description: 'Tab ID (1-based index) to switch to. Either tabId, title, or url must be provided.',
        },
        title: {
          type: 'string',
          description: 'Switch to tab with matching title (partial match). Either tabId, title, or url must be provided.',
        },
        url: {
          type: 'string',
          description: 'Switch to tab with matching URL (partial match). Either tabId, title, or url must be provided.',
        },
      },
      required: ['envId'],
    },
  },
  'take_screenshot': {
    description: 'Take a screenshot of the current page or a specific element in the browser environment (if you want to see the page, recommend to use chrome_get_web_content first)',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        name: { type: 'string', description: 'Name for the screenshot, if saving as PNG' },
        selector: { type: 'string', description: 'CSS selector for element to screenshot' },
        width: { type: 'number', description: 'Width in pixels, skip it if not needed' },
        height: { type: 'number', description: 'Height in pixels, skip it if not needed' },
        storeBase64: {
          type: 'boolean',
          description: 'Return screenshot in base64 format (default: false) if you want to see the page, recommend set this to be true',
          default: false
        },
        fullPage: {
          type: 'boolean',
          description: 'Store screenshot of the entire page (default: true)',
          default: true
        },
        savePng: {
          type: 'boolean',
          description: 'Save screenshot as PNG file (default: true), if you want to see the page, recommend set this to be false, and set storeBase64 to be true',
          default: true
        },
      },
      required: ["envId"],
    },
  },
  'close_tabs': {
    description: 'Close specified tabs in the browser environment',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        tabIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of tab IDs to close. If not provided, will close the active tab.',
        },
        url: {
          type: 'string',
          description: 'Close tabs matching this URL. Can be used instead of tabIds.',
        },
        closeAll: {
          type: 'boolean',
          description: 'Whether to close all tabs',
          default: false,
        },
      },
      required: ["envId"],
    },
  },
  'go_back_or_forward': {
    description: 'Navigate browser history (back/forward) in the browser environment',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        isForward: {
          type: 'boolean',
          description: 'Go forward in history if true, go back if false (default: false)',
        },
      },
      required: ["envId"],
    },
  },
  'chrome_get_web_content': {
    description: 'Get HTML and text content from the current page or a specific URL. If you want to get text content of one element without html tags , set textContent to be true.' +
                 'Otherwise, set htmlContent to be true to get html content. Noted, to get text content of whole page is not yet supported.',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        url: {
          type: 'string',
          description: 'URL to fetch content from. If not provided, uses the current active page',
        },
        htmlContent: {
          type: 'boolean',
          description: 'Get the visible HTML content of the page. If true, textContent will be ignored (default: false)',
        },
        textContent: {
          type: 'boolean',
          description: 'Get the visible text content of the page with metadata. Ignored if htmlContent is true (default: true)',
        },
        selector: {
          type: 'string',
          description: 'CSS selector to get content from a specific element. If provided, only content from this element will be returned',
        },
      },
      required: ['envId'],
    },
  },
  'chrome_click_element': {
    description: 'Click on an element in the current page or at specific coordinates',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        selector: {
          type: 'string',
          description: 'CSS selector for the element to click. Either selector or coordinates must be provided. if coordinates are not provided, the selector must be provided.',
        },
        coordinates: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'X coordinate relative to the viewport' },
            y: { type: 'number', description: 'Y coordinate relative to the viewport' },
          },
          description: 'Coordinates to click at (relative to viewport). If provided, takes precedence over selector.',
          required: ['x', 'y'],
        },
        waitForNavigation: {
          type: 'boolean',
          description: 'Wait for page navigation to complete after click (default: false)',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds for waiting for the element or navigation (default: 5000)',
        },
      },
      required: ['envId'],
    },
  },
  'chrome_fill_or_select': {
    description: 'Fill a form element or select an option with the specified value',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        selector: {
          type: 'string',
          description: 'CSS selector for the input element to fill or select',
        },
        value: {
          type: 'string',
          description: 'Value to fill or select into the element',
        },
      },
      required: ['envId', 'selector', 'value'],
    },
  },
  'chrome_get_interactive_elements': {
    description: 'Get interactive elements from the current page. Returns a list of elements with their properties, ' +
                 'if the list is empty, that means the tool failed to find any interactive elements.',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        elementType: {
          type: "string",
          description: "Type of interactive elements to retrieve (e.g. button, link, input)",
          enum: ["button", "link", "input", "all"],
          default: "all"
        },
        textQuery: {
          type: 'string',
          description: 'Text to search for within interactive elements (fuzzy search)',
        },
        selector: {
          type: 'string',
          description: 'CSS selector to filter interactive elements. Takes precedence over textQuery if both are provided.',
        },
        includeCoordinates: {
          type: 'boolean',
          description: 'Include element coordinates in the response (default: true)',
        },
      },
      required: ['envId'],
    },
  },
  'chrome_network_request': {
    description: 'Send a network request from the browser with cookies and other browser context',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        url: {
          type: 'string',
          description: 'URL to send the request to',
        },
        method: {
          type: 'string',
          description: 'HTTP method to use (default: GET)',
        },
        headers: {
          type: 'object',
          description: 'Headers to include in the request',
        },
        body: {
          type: 'string',
          description: 'Body of the request (for POST, PUT, etc.)',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)',
        },
      },
      required: ['envId', 'url'],
    },
  },
  'chrome_network_capture_start': {
    description: 'Start capturing network requests from a web page using Chrome webRequest API(without responseBody)',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        url: {
          type: 'string',
          description: 'URL to capture network requests from. If not provided, uses the current active tab',
        },
      },
      required: ['envId'],
    },
  },
  'chrome_network_capture_stop': {
    description: 'Stop capturing network requests using webRequest API and return the captured data',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
      },
      required: ['envId'],
    },
  },
  'chrome_keyboard': {
    description: 'Simulate keyboard events in the browser environment, optionally targeting a specific element. ' +
                 'Supports single keys, combinations (e.g. Ctrl+C), and special keys (e.g. Enter, Tab, PageUp, PageDown, ArrowUp, ArrowDown, ArrowLeft, ArrowRight).' +
                 'For example, use the PageDown and PageUp keys to scroll the page down and up, respectively.' +
                 'For multiple keys in sequence, seperate them with a comma.',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        keys: {
          type: 'string',
          description: 'Key sequence, supports combinations (e.g. Ctrl+C)',
        },
        selector: {
          type: 'string',
          description: 'Target element selector (optional) to focus before typing. If not provided, types to the active element or page.',
        },
        delay: {
          type: 'number',
          description: 'Delay between keys in ms',
          default: 0,
        },
      },
      required: ['envId', 'keys'],
    },
  },
  'chrome_history': {
    description: 'Retrieve and search browsing history from Chrome',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        text: {
          type: 'string',
          description: 'Text to search for in history URLs and titles. Leave empty to retrieve all history entries within the time range.',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of history entries to return. Use this to limit results for performance or to focus on the most relevant entries. (default: 100)',
        },
      },
      required: ['envId'],
    },
  },
  'chrome_session_history': {
    description: 'Navigate session history (back/forward/go to specific index)',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        action: {
          type: 'string',
          description: 'Action type: back, forward, go, get_entries, get',
          enum: ['back', 'forward', 'go', 'get_entries', 'get'],
        },
        index: {
          type: 'number',
          description: 'History index to navigate to (required for go action)',
        },
      },
      required: ['envId'],
    },
  },
  'chrome_console': {
    description: 'Capture and retrieve all console output from the current active browser tab/page. This captures console messages that existed before the tool was called.',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        url: {
          type: 'string',
          description: 'URL to navigate to and capture console from. If not provided, uses the current active tab',
        },
        includeExceptions: {
          type: 'boolean',
          description: 'Include uncaught exceptions in the output (default: true)',
        },
        maxMessages: {
          type: 'number',
          description: 'Maximum number of console messages to capture (default: 100)',
        },
      },
      required: ['envId'],
    },
  },
  'chrome_inject_script': {
    description: 'Inject JavaScript scripts into the page',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        action: {
          type: 'string',
          description: 'Action type: inject, inject_file, add_script_tag, remove_script, list_scripts',
          enum: ['inject', 'inject_file', 'add_script_tag', 'remove_script', 'list_scripts'],
        },
        script: {
          type: 'string',
          description: 'JavaScript code (required for inject)',
        },
        file_path: {
          type: 'string',
          description: 'Script file path (required for inject_file)',
        },
        url: {
          type: 'string',
          description: 'Script URL (required for add_script_tag)',
        },
        content: {
          type: 'string',
          description: 'Inline script content (for add_script_tag)',
        },
        id: {
          type: 'string',
          description: 'Script element ID (for add_script_tag)',
        },
        element_id: {
          type: 'string',
          description: 'Element ID to remove (for remove_script)',
        },
      },
      required: ['envId', 'action'],
    },
  },
  'chrome_script_library': {
    description: 'Load common script libraries (jQuery, Lodash, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        action: {
          type: 'string',
          description: 'Action type: load, list, check',
          enum: ['load', 'list', 'check'],
        },
        library: {
          type: 'string',
          description: 'Library name (jquery, lodash, moment, axios, chart.js)',
        },
        url: {
          type: 'string',
          description: 'Custom library URL',
        },
      },
      required: ['envId', 'action'],
    },
  },
  'chrome_send_command_to_inject_script': {
    description: 'If the script injected using chrome_inject_script listens for user-defined events, this tool can be used to trigger those events',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        tabId: {
          type: 'number',
          description: 'The tab where you previously injected the script (if not provided, use the currently active tab)',
        },
        eventName: {
          type: 'string',
          description: 'The eventName your injected content script listens for',
        },
        payload: {
          type: 'string',
          description: 'The payload passed to event, must be a JSON string',
        },
      },
      required: ['envId', 'eventName'],
    },
  },
  'chrome_mouse_control': {
    description: 'Control mouse and touch actions including move, click, wheel, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        action: {
          type: 'string',
          description: 'Action to perform: move, click, down, up, wheel.',
          enum: ['move', 'click', 'down', 'up', 'wheel'],
        },
        coordinates: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'X coordinate relative to the viewport, not available for wheel action.' },
            y: { type: 'number', description: 'Y coordinate relative to the viewport for other actions, not available for wheel action.' },
          },
          description: 'Coordinates to perform action at (relative to viewport). If provided, takes precedence over selector.',
        },
        selector: {
          type: 'string',
          description: 'CSS selector for the element to perform action on. Either selector or coordinates must be provided.',
        },
        button: {
          type: 'string',
          description: 'Mouse button to use: left, right, middle',
          default: 'left',
          enum: ['left', 'right', 'middle'],
        },
        count: {
          type: 'number',
          description: 'Number of clicks to perform',
          default: 1,
        },
        delay: {
          type: 'number',
          description: 'Delay between actions in milliseconds',
          default: 0,
        },
        touch: {
          type: 'boolean',
          description: 'Whether to use touch events instead of mouse events',
          default: false,
        },
        deltaX: {
          type: 'number',
          description: 'Horizontal scroll delta for wheel action',
          default: 0,
        },
        deltaY: {
          type: 'number',
          description: 'Vertical scroll delta for wheel action',
          default: 0,
        },
      },
      required: ['envId', 'action'],
    },
  },
  'chrome_get_element_attributes': {
    description: 'Get all attributes of a specified element by CSS selector on the current page, including computed style, outerHTML, and bounding box.',
    inputSchema: {
      type: 'object',
      properties: {
        envId: {
          type: 'string',
          description: 'Environment ID for the browser environment to operate.',
        },
        selector: {
          type: 'string',
          description: 'CSS selector for the element to get attributes from',
        },
      },
      required: ['envId', 'selector'],
    },
  }
};