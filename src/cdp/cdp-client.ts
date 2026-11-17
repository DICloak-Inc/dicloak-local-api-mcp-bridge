/**
 * CDP Client Wrapper
 *
 * Provides a compatible interface with the original CDP client
 */

import { Page, CDPSession } from 'playwright-core';

export class CDPClient {
  public page: Page;
  public cdpSession: CDPSession;
  public Runtime: RuntimeDomain;
  public Page: PageDomain;
  public Network: NetworkDomain;
  public Target: TargetDomain;
  public DOM: DOMDomain;
  public Input: InputDomain;
  public Emulation: EmulationDomain;

  private constructor(page: Page, cdpSession: CDPSession) {
    this.page = page;
    this.cdpSession = cdpSession;
    this.Runtime = new RuntimeDomain(cdpSession);
    this.Page = new PageDomain(page, cdpSession);
    this.Network = new NetworkDomain(cdpSession);
    this.Target = new TargetDomain(cdpSession);
    this.DOM = new DOMDomain(cdpSession);
    this.Input = new InputDomain(cdpSession);
    this.Emulation = new EmulationDomain(cdpSession);
  }

  static async create(page: Page): Promise<CDPClient> {
    const cdpSession = await page.context().newCDPSession(page);
    return new CDPClient(page, cdpSession);
  }

  /**
   * Update the CDP session and refresh all domain objects
   */
  async updateSession(page: Page, cdpSession: CDPSession): Promise<void> {
    this.page = page;
    this.cdpSession = cdpSession;

    // Refresh all domain objects with the new session
    this.Runtime = new RuntimeDomain(cdpSession);
    this.Page = new PageDomain(page, cdpSession);
    this.Network = new NetworkDomain(cdpSession);
    this.Target = new TargetDomain(cdpSession);
    this.DOM = new DOMDomain(cdpSession);
    this.Input = new InputDomain(cdpSession);
    this.Emulation = new EmulationDomain(cdpSession);
  }
}

/**
 * Runtime Domain
 */
export class RuntimeDomain {
  constructor(private cdpSession: CDPSession) {}

  async evaluate(params: { expression: string; [key: string]: any }): Promise<any> {
    try {
      return await this.cdpSession.send('Runtime.evaluate', params);
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }

  async callFunctionOn(params: { functionDeclaration: string; objectId?: string; [key: string]: any }): Promise<any> {
    try {
      return await this.cdpSession.send('Runtime.callFunctionOn', params);
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }
}

/**
 * Page Domain
 */
export class PageDomain {
  private navHistory: Array<{ id: number; url: string; title: string; transitionType: string }> = [];
  private navIndex: number = -1;

  constructor(private page: Page, private cdpSession: CDPSession) {}

  async getNavigationHistory(): Promise<any> {
    try {
      const currentUrl = this.page.url();
      const currentTitle = await this.page.title();

      // Add to history if it's new or different from the last entry
      if (this.navHistory.length === 0 || this.navHistory[this.navHistory.length - 1].url !== currentUrl) {
        // Truncate forward history if we're not at the end
        if (this.navIndex < this.navHistory.length - 1) {
          this.navHistory = this.navHistory.slice(0, this.navIndex + 1);
        }

        const entry = {
          id: this.navHistory.length + 1,
          url: currentUrl,
          title: currentTitle,
          transitionType: 'auto_subframe',
        };
        this.navHistory.push(entry);
        this.navIndex = this.navHistory.length - 1;
      }

      return {
        currentIndex: this.navIndex,
        entries: this.navHistory,
      };
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }

  async navigateToHistoryEntry(params: { entryId: number }): Promise<any> {
    try {
      const entry = this.navHistory.find((e) => e.id === params.entryId);
      if (!entry) {
        return { error: { message: 'History entry not found' } };
      }

      const index = this.navHistory.indexOf(entry);
      this.navIndex = index;
      await this.page.goto(entry.url);
      return { result: 'ok' };
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }

  async navigate(params: { url: string }): Promise<any> {
    try {
      await this.page.goto(params.url);
      return { frameId: 'main' };
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }

  async reload(): Promise<any> {
    try {
      await this.page.reload();
      return {};
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }

  async captureScreenshot(params?: any): Promise<any> {
    try {
      return await this.cdpSession.send('Page.captureScreenshot', params || {});
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }
}

/**
 * Network Domain
 */
export class NetworkDomain {
  constructor(private cdpSession: CDPSession) {}

  async enable(): Promise<any> {
    try {
      return await this.cdpSession.send('Network.enable');
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }

  async disable(): Promise<any> {
    try {
      return await this.cdpSession.send('Network.disable');
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }

  async setCacheDisabled(params: { cacheDisabled: boolean }): Promise<any> {
    try {
      return await this.cdpSession.send('Network.setCacheDisabled', params);
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }
}

/**
 * Target Domain
 */
export class TargetDomain {
  constructor(private cdpSession: CDPSession) {}

  async getTargets(): Promise<any> {
    try {
      return await this.cdpSession.send('Target.getTargets');
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }

  async attachToTarget(params: { targetId: string; flatten?: boolean }): Promise<any> {
    try {
      return await this.cdpSession.send('Target.attachToTarget', params);
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }

  async closeTarget(params: { targetId: string }): Promise<any> {
    try {
      return await this.cdpSession.send('Target.closeTarget', params);
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }
}

/**
 * DOM Domain
 */
export class DOMDomain {
  constructor(private cdpSession: CDPSession) {}

  async getDocument(): Promise<any> {
    try {
      return await this.cdpSession.send('DOM.getDocument');
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }

  async querySelector(params: { nodeId: number; selector: string }): Promise<any> {
    try {
      return await this.cdpSession.send('DOM.querySelector', params);
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }
}

/**
 * Input Domain
 */
export class InputDomain {
  constructor(private cdpSession: CDPSession) {}

  async dispatchMouseEvent(params: any): Promise<any> {
    try {
      return await this.cdpSession.send('Input.dispatchMouseEvent', params);
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }

  async dispatchKeyEvent(params: any): Promise<any> {
    try {
      return await this.cdpSession.send('Input.dispatchKeyEvent', params);
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }
}

/**
 * Emulation Domain
 */
export class EmulationDomain {
  constructor(private cdpSession: CDPSession) {}

  async setDeviceMetricsOverride(params: any): Promise<any> {
    try {
      return await this.cdpSession.send('Emulation.setDeviceMetricsOverride', params);
    } catch (error: any) {
      return { error: { message: error.message } };
    }
  }
}
