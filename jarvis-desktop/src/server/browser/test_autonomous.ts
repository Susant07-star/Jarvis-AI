import { createPlan } from './planner';
import { executePlan } from './executor';

async function runAutonomousTest() {
    // Setting required goal
    const goal = "Search AI agents on YouTube, open a video, like it and comment 'Amazing explanation!'";
    
    console.log(`User Goal: ${goal}`);
    const plan = await createPlan(goal);
    
    if (plan.actions.length > 0) {
        await executePlan(plan.actions);
        console.log("Autonomous multi-step working");
        process.exit(0);
    } else {
        console.log("Failed to create plan");
        process.exit(1);
    }
}

runAutonomousTest().catch((e) => {
    console.error(e);
    process.exit(1);
});
