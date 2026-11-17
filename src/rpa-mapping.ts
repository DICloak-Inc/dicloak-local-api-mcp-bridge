import { JSONSchema7 } from 'json-schema';

// 创建一个专用于 MCP 工具的 InputSchema 类型
// 它继承自 JSONSchema7，但强制要求 type 必须是 'object'
export type McpToolInputSchema = Omit<JSONSchema7, 'type'> & {
  type: 'object';
  properties: { [key: string]: JSONSchema7 };
  required?: string[];
};

export interface RpaProcess {
  id: string; // 真实的 rpa_id
  toolName: string; // 将要生成给 AI 的工具名，例如 "runCookieCollector"
  summary: string; // 工具的简短描述
  keywords: string[];
  // 核心！每个 RPA 都有自己独立的 inputSchema
  inputSchema: McpToolInputSchema;
}

const commonInputSchema: { [key: string]: JSONSchema7 } = {
  env_ids: {
    type: 'array',
    items: { type: 'string' },
    description:
      'One or more environment IDs where this task should run. If the user did not provide environment details (name, id, remark, serial number), prompt for them or offer to help create an environment.',
  },
  run_timeout: {
    type: 'number',
    description:
      'Overall process timeout in seconds. The environment will be closed automatically after this period.',
    default: 600,
  },
  is_cancel_close: {
    type: 'string',
    enum: ['0', '1'],
    default: '0',
    description: 'Should the environment be closed after the execution is completed? 0 means close, 1 means do not close. The default is 0. If you set it to 1, please set run_timeout to 0 to avoid automatic closing due to timeout.',
  }
}

export const RPA_MAPPING: RpaProcess[] = [
  {
    id: '1912069864283885573',
    toolName: 'cookie-robot',
    summary: 'Automatically browse specified websites and collect cookie information. Important: provide a list of site URLs.',
    keywords: [
      'cookie',
      'collect cookies',
      'get cookies',
      'cookie collection',
      'automatic cookie',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          items: { type: 'string' },
          description:
            'List of website URLs to collect cookies from. Example: ["https://example.com", "https://another.com"]',
        },
        ...commonInputSchema,
      },
      required: ['env_ids', 'urls'],
    },
  },
  {
    id: '1912069864283885575',
    toolName: 'tikTok-likes-counter',
    summary: 'Activate TikTok accounts: automatically browse home feed videos and like them.',
    keywords: ['tiktok', 'auto-like tiktok', 'tiktok like'],
    inputSchema: {
      type: 'object',
      properties: {
        playCount: {
          type: 'number',
          description: 'Number of videos to browse.',
          default: 10,
        },
        isLike: {
          type: 'string',
          enum: ['yes', 'no', 'random'],
          description: 'Whether to like videos.',
          default: 'random',
        },
        likeDelay: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Delay before liking a video, in milliseconds. Example ["2000", "3000"] means a random delay between 2 and 3 seconds.',
          default: ['2000', '3000'],
        },
        scrollDelay: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Delay before scrolling to the next video, in milliseconds. Example ["4000", "8000"] means a random delay between 4 and 8 seconds.',
          default: ['4000', '8000'],
        },
        ...commonInputSchema,
      },
      required: ['env_ids'],
    },
  },
  {
    id: '1912069864283885569',
    toolName: 'tikTok-influencer-scraper',
    summary:
      'Scrape and collect TikTok influencer follower data. Important: provide the influencer profile URL or username.',
    keywords: ['tiktok', 'tiktok followers', 'tiktok follower list'],
    inputSchema: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of follower records to scrape.',
          default: 20,
        },
        homeUrl: {
          type: 'string',
          description:
            "Full profile URL of the TikTok influencer. If the user provides only a username, you may assist by constructing the full URL (e.g. https://www.tiktok.com/@shou.time).",
        },
        ...commonInputSchema,
      },
      required: ['env_ids', 'homeUrl'],
    },
  },
  {
    id: '1958421536865632258',
    toolName: 'youTube-automatic-uploader',
    summary: 'Automatically upload YouTube videos. Important: provide video file path and content description.',
    keywords: ['youtube', 'automatic upload', 'upload video'],
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description:
            'Description of the video content, such as title and description. Limit to 5000 characters.',
          default: '',
        },
        filePath: {
          type: 'string',
          description:
            'Path to the video file, supporting local or network URLs. Examples: https://example.com/video.mp4 or C:\\Users\\servi\\Downloads\\video.mp4. Note: use the correct path format for macOS or Windows.',
        },
        ...commonInputSchema,
      },
      required: ['env_ids', 'content', 'filePath'],
    },
  },
  {
    id: '1912069864283885574',
    toolName: 'amazon-comments-crawling',
    summary:
      'Scrape comments for a specified product on Amazon. Important: provide the product URL; keyword searches are not supported.',
    keywords: ['amazon', 'scrape comments', 'product comments'],
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'Amazon product URL to scrape reviews from. Example: https://amazon.com/Roku-Express-Streaming-Wireless-Controls/dp/B0916TKFF2/',
        },
        maxReviews: {
          type: 'number',
          description: 'Maximum number of reviews to scrape.',
          default: 5,
        },
        ...commonInputSchema,
      },
      required: ['url'],
    },
  },
  {
    id: '1912069864283885577',
    toolName: 'amazon-auto-add-cart',
    summary:
      'Visit Amazon, search for products, browse items, and add products from the list to the cart. Important: provide search keywords.',
    keywords: ['amazon', 'add to cart', 'browse products'],
    inputSchema: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'Product name or keywords for searching on Amazon.',
        },
        count: {
          type: 'number',
          description: 'Number of products to browse and add to cart. Minimum 1, maximum 10.',
          default: 3,
        },
        ...commonInputSchema,
      },
      required: ['keyword'],
    },
  },
  {
    id: '1912069864283885570',
    toolName: 'tikTok-information-scraper',
    summary:
      'Search TikTok videos by keyword and collect related video information. Can collect multiple videos. Important: provide search keywords.',
    keywords: ['tiktok', 'scrape videos', 'video information'],
    inputSchema: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'TikTok keyword used to search for videos.',
        },
        getDataCount: {
          type: 'number',
          description: 'Number of videos to scrape.',
          default: 3,
        },
        ...commonInputSchema,
      },
      required: ['keyword'],
    },
  },
  {
    id: '1984094398961385474',
    toolName: 'youtube-like-comment-viewer',
    summary:
      'Visit specified YouTube video links to view, like and comment. Supports multiple video links and multiple comments. Important: keyword search is not supported.',
    keywords: ['youtube', 'view videos', 'like', 'comment'],
    inputSchema: {
      type: 'object',
      properties: {
        view_urls: {
          type: 'array',
          items: { type: 'string' },
          description:
            'List of YouTube video URLs to operate on. Example: ["https://www.youtube.com/watch?v=DQKoNQcObn4&list=PLGCWpnvrwS15CBjWsPnG097E0IwYDXVwk&index=3"]',
        },
        comments: {
          type: 'string',
          description:
            'Comment contents to post. Multiple comments are supported; join multiple comment lines with a newline character.',
        },
        commentCount: {
          type: 'number',
          description:
            'Controls how comments are applied: 0 or empty => random comment per YouTube account (each video gets a random entry from [comments]); 1 => different accounts can comment different content (ensure number of environments equals number of comment entries).',
        },
        isLike: {
          type: 'string',
          enum: ['yes', 'no', 'random'],
          description: 'Whether to like videos.',
          default: 'random',
        },
        viewTime: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Viewing time per video in milliseconds. Example ["2000", "3000"] means a random duration between 2 and 3 seconds.',
          default: ['5000', '8000'],
        },
        viewInterval: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Interval before the next video in milliseconds. Example ["2000", "3000"] means a random interval between 2 and 3 seconds.',
          default: ['10000', '20000'],
        },
        skipAd: {
          type: 'string',
          enum: ['yes', 'no', 'random'],
          description: 'Whether to skip ads. Note: skipping YouTube ads may have side effects.',
          default: 'no',
        },
        ...commonInputSchema,
      },
      required: ['comments', 'view_urls'],
    },
  },
  {
    id: '1912069864283885571',
    toolName: 'youtube-search-engage',
    summary:
      'Search YouTube for videos by keyword and perform view, like, and comment actions. Important: direct operation on specific video links is not supported.',
    keywords: ['youtube', 'view videos', 'like', 'comment'],
    inputSchema: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'Keyword to search for; maximum 200 characters.',
        },
        comment: {
          type: 'string',
          description: 'Comment content; if empty, no comment will be posted.',
          default: '',
        },
        isLike: {
          type: 'string',
          enum: ['yes', 'no', 'random'],
          description: 'Whether to like videos.',
          default: 'random',
        },
        selectTitle: {
          type: 'string',
          description:
            'Optional title to match when selecting which search results to play, like, or comment on.',
        },
        ...commonInputSchema,
      },
      required: ['keyword', 'selectTitle'],
    },
  },
  {
    id: '1912069864283885580',
    toolName: 'youtube-subtitle-scraper',
    summary: 'Scrape subtitles from a specified YouTube video. Important: a video URL is required.',
    keywords: ['youtube', 'video subtitles', 'scrape subtitles', 'get subtitles'],
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Video URL (retrieveable on desktop); must start with https://',
        },
        ...commonInputSchema,
      },
      required: ['url'],
    },
  },
  {
    id: '1912069864283885572',
    toolName: 'youtube-comments-scraper',
    summary: 'Scrape comments from a specified YouTube video. Important: a video URL is required.',
    keywords: ['youtube', 'video comments', 'scrape comments', 'get comments'],
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Video URL (retrieveable on desktop); must start with https://',
        },
        count: {
          type: 'number',
          description: 'Number of comments to scrape.',
          default: 10,
        },
        ...commonInputSchema,
      },
      required: ['url'],
    },
  },
];

/**
 * 根据用户的输入，在知识库中查找最匹配的 RPA 流程。
 * @param userInput 用户的原始任务描述，例如 "帮我收集 cookie"
 * @returns 匹配到的 RpaProcess 对象，或 null
 */
export function findRpaProcess(userInput: string): RpaProcess | null {
  const lowercasedInput = userInput.toLowerCase();
  for (const process of RPA_MAPPING) {
    for (const keyword of process.keywords) {
      if (lowercasedInput.includes(keyword.toLowerCase())) {
        return process;
      }
    }
  }
  return null;
}
