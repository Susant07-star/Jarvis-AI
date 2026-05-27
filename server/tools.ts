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
                type: { type: "string", enum: ["open_tab", "new_tab", "go_back", "skip_ad", "search_site", "media_control", "scroll", "fill_form"] },
                url: { type: "string", description: "URL for open_tab or new_tab" },
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
  },
  {
    type: "function",
    function: {
      name: "schedule_action",
      description: "Schedule a future call or message. Use this for 'Remind me in X', 'Call me at Y', etc. You MUST calculate delay_seconds relative to NOW.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["call", "message"], description: "Action type." },
          content: { type: "string", description: "The message or call reason." },
          delay_seconds: { type: "number", description: "TOTAL seconds to wait from now. 1 min = 60, 1 hour = 3600." },
          confirmation_message: { type: "string", description: "Natural confirmation, e.g., 'Right away Boss, timer set for 60 seconds.'" }
        },
        required: ["type", "content", "delay_seconds", "confirmation_message"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_local_os_command",
      description: "Execute a physical OS command on the user's local computer via I.R.I.S. Use this for opening desktop apps, phantom typing in an IDE, controlling Android phones via ADB, or clicking coordinates on the physical screen. Includes automatic visual verification after each action.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["open_app", "phantom_type", "adb_command", "click_screen", "run_command", "type_text", "press_key", "screenshot", "scroll"], description: "The specific local OS action to perform." },
          payload: { type: "string", description: "JSON string containing parameters for the action. E.g. {\"appName\":\"vscode\"} for open_app, or {\"text\":\"console.log('hello')\"} for phantom_type." },
          confirmation_message: { type: "string", description: "Natural confirmation spoken to the user. E.g., 'Right away sir, deploying phantom typer.'"}
        },
        required: ["action", "payload", "confirmation_message"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_system_status",
      description: "Get the current system metrics (CPU, memory, battery) and monitoring status. Use this to check if the system is under stress or to provide telemetry to the user.",
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
      name: "detect_and_research_processes",
      description: "Trigger immediate process scan and research for suspicious applications. Useful when the user wants to check for potential malware or unknown programs running on their system.",
      parameters: {
        type: "object",
        properties: {
          research_suspicious: { type: "boolean", description: "Whether to automatically research unknown processes via web search" },
          confirmation_message: { type: "string", description: "Natural confirmation for the user" }
        },
        required: ["confirmation_message"]
      }
    }
  }
];
