import { Page } from 'playwright';

export async function extractDOM(page: Page) {
    return await page.evaluate(() => {
        const elements: any[] = [];
        const interactables = document.querySelectorAll('button, a, input, textarea, select, [role="button"], [role="link"], [role="checkbox"]');
        
        interactables.forEach((el) => {
            const rect = el.getBoundingClientRect();
            // Check if visibly rendered
            if (rect.width > 0 && rect.height > 0) {
                let role = el.getAttribute('role') || el.tagName.toLowerCase();
                if (role === 'a') role = 'link';
                
                elements.push({
                    tag: el.tagName.toLowerCase(),
                    role: role,
                    text: (el as HTMLElement).innerText?.trim().slice(0, 50) || '',
                    ariaLabel: el.getAttribute('aria-label') || '',
                    placeholder: el.getAttribute('placeholder') || '',
                    type: el.getAttribute('type') || '',
                    value: (el as HTMLInputElement).value || ''
                });
            }
        });
        
        // Condensed contextual map payload representing the active viewport elements
        return elements.filter(e => e.text || e.ariaLabel || e.placeholder || e.value).slice(0, 80);
    });
}
