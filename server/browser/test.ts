import { executeAction, BrowserAction } from './executor';

async function runTest() {
    const actions: BrowserAction[] = [
        { action: 'open_url', url: 'https://google.com' },
        { action: 'type', selector: 'textarea[name="q"], input[name="q"]', text: 'Playwright tutorial' },
        { action: 'click', selector: 'textarea[name="q"], input[name="q"]' },
        { action: 'press', key: 'Enter' },
        { action: 'scroll', direction: 'down' },
        { action: 'click', selector: 'h3' } // click first result
    ];

    for (const action of actions) {
        await executeAction(action);
    }
    
    console.log("Playwright working with executor");
    process.exit(0);
}

runTest().catch((e) => {
    console.error(e);
    process.exit(1);
});
