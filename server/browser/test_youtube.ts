import { executePlan, BrowserAction } from './executor';

async function runTest() {
    const actions: BrowserAction[] = [
        { action: 'youtube_search', query: 'AI agents' },
        { action: 'youtube_click_video' },
        { action: 'youtube_like' }
    ];

    await executePlan(actions);
    
    console.log("YouTube control working");
    process.exit(0);
}

runTest().catch((e) => {
    console.error(e);
    process.exit(1);
});
