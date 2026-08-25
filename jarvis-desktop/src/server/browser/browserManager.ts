import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';

let context: BrowserContext | null = null;
let page: Page | null = null;

export async function initBrowser() {
    if (context) return { context, page };
    
    console.log("Browser initialized");
    const userDataDir = path.resolve(process.cwd(), './browser-data');
    
    context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
    });
    
    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();
    
    return { context, page };
}

export function getPage(): Page {
    if (!page) throw new Error("Browser not initialized. Call initBrowser() first.");
    return page;
}

export function getContext(): BrowserContext {
    if (!context) throw new Error("Browser not initialized. Call initBrowser() first.");
    return context;
}
