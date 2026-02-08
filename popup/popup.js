document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const modelInput = document.getElementById('model');
    const systemPromptInput = document.getElementById('systemPrompt');
    const saveBtn = document.getElementById('saveBtn');
    const status = document.getElementById('status');
    const shortcutsBtn = document.getElementById('shortcutsBtn');

    const DEFAULT_SYSTEM_PROMPT = "You are an expert prompt engineer. Refine the following prompt to be concise, clear, and highly effective for an LLM. Return ONLY the refined prompt text. be as descriptive as possible.";

    // Load Settings
    chrome.storage.local.get(['pjApiKey', 'pjModel', 'pjSystemPrompt'], (result) => {
        if (result.pjApiKey) apiKeyInput.value = result.pjApiKey;
        if (result.pjModel) modelInput.value = result.pjModel;
        else modelInput.value = 'mistralai/mistral-7b-instruct:free';

        systemPromptInput.value = result.pjSystemPrompt || DEFAULT_SYSTEM_PROMPT;
    });

    // Save Settings
    saveBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        const model = modelInput.value.trim();
        const sysPrompt = systemPromptInput.value.trim();

        chrome.storage.local.set({
            pjApiKey: key,
            pjModel: model,
            pjSystemPrompt: sysPrompt
        }, () => {
            status.textContent = 'Settings Saved! ✅';
            setTimeout(() => {
                status.textContent = '';
            }, 2000);
        });
    });

    // Configure Shortcuts
    shortcutsBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
});
