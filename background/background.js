// Background script for PromptInject extension

// Create context menu on installation
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "prompt-inject-insert",
        title: "Insert Saved Prompt",
        contexts: ["editable"]
    });

    chrome.contextMenus.create({
        id: "prompt-inject-save-selection",
        title: "Save as Prompt",
        contexts: ["selection"]
    });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "prompt-inject-insert") {
        sendMessageToContentScript(tab.id, { action: "open_overlay" });
    } else if (info.menuItemId === "prompt-inject-save-selection") {
        sendMessageToContentScript(tab.id, {
            action: "open_add_prompt",
            text: info.selectionText
        });
    }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
    if (command === "open_prompt_overlay") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                sendMessageToContentScript(tabs[0].id, { action: "open_overlay" });
            }
        });
    }
});



// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'optimize_prompt') {
        handleOptimization(request, sendResponse);
        return true; // Keep channel open for async response
    }
});

async function handleOptimization(request, sendResponse) {
    const { apiKey, model, systemPrompt, prompt } = request;
    try {
        // Use provided model or default
        const modelToUse = model || "mistralai/mistral-7b-instruct:free";
        const optimizedText = await callOpenRouter(apiKey, modelToUse, systemPrompt, prompt);
        sendResponse({ success: true, text: optimizedText });
    } catch (error) {
        console.error("Optimization error:", error);
        sendResponse({ success: false, error: error.message });
    }
}

async function callOpenRouter(key, model, systemPrompt, prompt) {
    const defaultSystemPrompt = "You are an expert prompt engineer. Refine the following prompt to be concise, clear, and highly effective for an LLM. Return ONLY the refined prompt text. be as descriptive as possible.";

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
            'HTTP-Referer': 'https://github.com/PromptInject', // Required by OpenRouter
            'X-Title': 'PromptInject Extension'
        },
        body: JSON.stringify({
            model: model,
            messages: [
                { role: "system", content: systemPrompt || defaultSystemPrompt },
                { role: "user", content: prompt }
            ]
        })
    });
    if (!res.ok) {
        const errorText = await res.text();
        console.error("OpenRouter API Error:", errorText);
        try {
            const errorJson = JSON.parse(errorText);
            throw new Error(errorJson.error?.message || `API Error: ${res.status} ${res.statusText}`);
        } catch (e) {
            // If parsing fails, throw raw text or status
            throw new Error(`API Error: ${res.status} ${res.statusText} - ${errorText}`);
        }
    }
    const data = await res.json();

    console.log("OpenRouter Data:", data);

    if (data.error) {
        console.error("OpenRouter Data Error:", data.error);
        throw new Error(data.error.message || JSON.stringify(data.error));
    }

    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
        return data.choices[0].message.content.trim();
    } else {
        throw new Error("No response content from AI provider.");
    }
}



// Helper function to send message to content script
function sendMessageToContentScript(tabId, message) {
    chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
            // Content script might not be loaded yet or connection failed
            console.warn("Could not send message to content script:", chrome.runtime.lastError.message);

            // Check if we can inject
            chrome.tabs.get(tabId, (tab) => {
                if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
                    console.warn("Cannot inject content script into restricted URL:", tab.url);
                    return;
                }

                // Inject content script if not present (simple fallback)
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ["content/content.js"]
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error("Failed to inject content script safely:", chrome.runtime.lastError.message);
                    } else {
                        // Retry sending message
                        chrome.tabs.sendMessage(tabId, message);
                    }
                });
            });
        }
    });
}
