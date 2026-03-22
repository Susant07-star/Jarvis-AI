export const jarvisTools = [
  {
    type: "function",
    function: {
      name: "execute_browser_commands",
      description: "Execute a sequence of browser commands. Use this when the user asks to control the browser, open tabs, search websites, control media, scroll, or fill forms.",
      parameters: {
        type: "object",
        properties: {
          confirmation_message: {
            type: "string",
            description: "A natural, spoken confirmation of what Jarvis is about to do. E.g., 'Right away, Sir. Searching YouTube for Service AI tutorials.'"
          },
          commands: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["open_tab", "search_site", "media_control", "scroll", "fill_form"] },
                url: { type: "string", description: "URL for open_tab" },
                query: { type: "string", description: "Search query for search_site" },
                site: { type: "string", description: "Website name for search_site (e.g., 'youtube', 'google')" },
                target_tab: { type: "string", description: "Optional. The name of the site/tab to target (e.g., 'youtube', 'google'). If omitted, the system will try to infer it." },
                force_new_tab: { type: "boolean", description: "Set to true ONLY if the user explicitly asks to open in a NEW tab." },
                action: { type: "string", enum: ["play", "pause", "skip_forward", "skip_backward", "seek"], description: "Action for media_control" },
                seconds: { type: "number", description: "Seconds to skip or seek for media_control" },
                direction: { type: "string", enum: ["up", "down"], description: "Direction for scroll" },
                amount: { type: "number", description: "Amount of pixels to scroll" },
                field: { type: "string", description: "Field name for fill_form" },
                value: { type: "string", description: "Value to fill for fill_form" }
              },
              required: ["type"]
            }
          }
        },
        required: ["confirmation_message", "commands"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_page",
      description: "Scan the current webpage to get a numbered list of all visible buttons, links, and inputs. USE THIS FIRST when the user asks to click something or fill a form, so you know which ID to interact with.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "interact_element",
      description: "Interact with an element on the parsed webpage map using its unique jarvis_id.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["click", "type"] },
          jarvis_id: { type: "integer", description: "The ID of the element to interact with, obtained from analyze_page" },
          text: { type: "string", description: "The text to type, if action is 'type'" }
        },
        required: ["action", "jarvis_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the web for current events, facts, or information.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" }
        },
        required: ["query"]
      }
    }
  }
];
