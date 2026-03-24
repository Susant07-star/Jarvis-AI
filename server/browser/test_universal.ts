import { executePlan } from './executor';
import { planWithDOM } from './planner';
import { extractDOM } from './domExtractor';
import { initBrowser } from './browserManager';

async function runUniversalTest() {
    try {
        const { page } = await initBrowser();
        
        console.log("Navigating to Wikipedia...");
        await page.goto('https://en.wikipedia.org', { waitUntil: 'domcontentloaded' });
        
        // Extract the semantic map of the raw DOM layout
        const domElements = await extractDOM(page);
        console.log(`Extracted ${domElements.length} semantic elements from the page.`);
        
        const goal = "Detect the main search input using placeholder, type query 'Playwright', and press Enter. Ensure to return a strict array utilizing 'universal_type' followed by 'press'.";
        console.log(`User Goal: ${goal}`);
        
        // Execute the contextual extraction planner
        const plan = await planWithDOM(goal, domElements);
        
        if (plan && plan.length > 0) {
            await executePlan(plan);
            console.log("Universal DOM layer working");
            process.exit(0);
        } else {
            console.log("Failed to create plan based on DOM context.");
            process.exit(1);
        }
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

runUniversalTest();
