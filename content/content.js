// Content Script for PromptInject Extension
(function () {
    // Prevent re-injection if already running
    if (window.hasPromptInject) return;
    window.hasPromptInject = true;

    let lastActiveElement = null;

    // Track the last active element to know where to insert text
    document.addEventListener('focusin', (e) => {
        const host = document.getElementById('prompt-inject-host');
        if (host && (e.target === host || host.contains(e.target))) {
            return;
        }
        lastActiveElement = e.target;
    }, true);

    document.addEventListener('click', (e) => {
        const host = document.getElementById('prompt-inject-host');
        if (host && (e.target === host || host.contains(e.target))) {
            return;
        }
        if (isEditable(e.target)) {
            lastActiveElement = e.target;
        }
    }, true);

    function isEditable(el) {
        if (!el) return false;
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
        if (el.isContentEditable) return true;
        return false;
    }

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'open_overlay') {
            createOverlay();
        } else if (request.action === 'open_add_prompt') {
            createOverlay();
            // Wait briefly for overlay to init
            setTimeout(() => {
                if (typeof window.pjOpenAddPrompt === 'function') {
                    window.pjOpenAddPrompt(request.text);
                }
            }, 100);
        }
    });

    function createOverlay() {
        if (document.getElementById('prompt-inject-host')) {
            return; // Already open
        }

        let target = lastActiveElement;

        if (!target || !target.isConnected || !isEditable(target)) {
            if (isEditable(document.activeElement)) {
                target = document.activeElement;
            }
        }

        if (!target) return;

        const rect = target.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        const host = document.createElement('div');
        host.id = 'prompt-inject-host';
        host.style.position = 'absolute';
        host.style.top = '0';
        host.style.left = '0';
        host.style.width = '100%';
        host.style.height = '100%';
        host.style.zIndex = '2147483647';
        host.style.pointerEvents = 'none';
        document.body.appendChild(host);

        const shadow = host.attachShadow({ mode: 'closed' });

        const style = document.createElement('link');
        style.rel = 'stylesheet';
        style.href = chrome.runtime.getURL('styles/overlay.css');
        shadow.appendChild(style);

        const overlay = document.createElement('div');
        overlay.id = 'pj-overlay';
        overlay.style.pointerEvents = 'auto';

        // --- Hybrid Positioning Logic ---
        const margin = 8;
        const viewportHeight = window.innerHeight;
        const overlayHeight = 400; // Expected max height

        let top, left;

        // Vertical Alignment
        if (rect.bottom + overlayHeight + margin > viewportHeight && rect.top - overlayHeight - margin > 0) {
            // Place above if no space below
            top = rect.top + scrollTop - overlayHeight - margin;
            overlay.style.bottom = `${viewportHeight - (rect.top + scrollTop)}px`;
            overlay.style.top = 'auto';
        } else {
            // Place below (Standard) or fallback
            top = rect.bottom + scrollTop + margin;
            overlay.style.top = `${top}px`;
        }

        // Horizontal Alignment
        left = rect.left + scrollLeft;
        if (left + 340 > window.innerWidth + scrollLeft) {
            left = (rect.right + scrollLeft) - 340;
        }
        if (left < scrollLeft) left = scrollLeft + 10;

        overlay.style.left = `${left}px`;

        // Restore Dropdown State
        const restoreDropdownPosition = () => {
            overlay.classList.remove('pj-modal-state');
            if (overlay.style.bottom) {
                overlay.style.top = 'auto';
            } else {
                overlay.style.top = `${top}px`;
            }
            overlay.style.left = `${left}px`;
            overlay.style.transform = '';
        };


        // -- LIST VIEW --
        const listView = document.createElement('div');
        listView.id = 'pj-view-list';
        listView.style.display = 'block';

        const listHeader = document.createElement('div');
        listHeader.className = 'pj-header';
        listHeader.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
                <img src="${chrome.runtime.getURL('assets/icon48.png')}" style="width:20px;height:20px;">
                <span>PromptInject</span>
            </div>
            <button class="pj-close-btn">&times;</button>
        `;
        listView.appendChild(listHeader);

        const searchContainer = document.createElement('div');
        searchContainer.className = 'pj-search-container';
        const searchInput = document.createElement('input');
        searchInput.id = 'pj-search-input';
        searchInput.type = 'text';
        searchInput.placeholder = 'Search prompts...';
        searchInput.setAttribute('autocomplete', 'off');
        searchContainer.appendChild(searchInput);
        listView.appendChild(searchContainer);

        const list = document.createElement('ul');
        list.className = 'pj-prompt-list';
        listView.appendChild(list);

        const listFooter = document.createElement('div');
        listFooter.className = 'pj-footer';
        const addBtn = document.createElement('button');
        addBtn.className = 'pj-btn pj-btn-primary';
        addBtn.textContent = '+ Add New';
        listFooter.appendChild(addBtn);
        listView.appendChild(listFooter);

        // -- ADD VIEW --
        const addView = document.createElement('div');
        addView.id = 'pj-view-add';
        addView.style.display = 'none';
        addView.className = 'pj-management-view';

        const addHeader = document.createElement('div');
        addHeader.className = 'pj-header';
        addHeader.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
                <img src="${chrome.runtime.getURL('assets/icon48.png')}" style="width:20px;height:20px;">
                <span>New Prompt</span>
            </div>
        `;
        addView.appendChild(addHeader);

        const formContainer = document.createElement('div');
        formContainer.innerHTML = `
            <div class="pj-form-group">
                <label>Name</label>
                <input type="text" class="pj-input-field" id="pj-new-prompt-name" placeholder="e.g. Intro">
            </div>
            <div class="pj-form-group">
                <label>Prompt</label>
                <textarea class="pj-textarea-field" id="pj-new-prompt-text" placeholder="Prompt text..."></textarea>
            </div>
        `;
        addView.appendChild(formContainer);

        const addFooter = document.createElement('div');
        addFooter.className = 'pj-footer';
        addFooter.innerHTML = `
            <div class="pj-actions-left">
                <button class="pj-btn pj-btn-icon" id="pj-optimize-btn" title="Optimize with AI">✨</button>
            </div>
            <div class="pj-actions-right">
                <button class="pj-btn" id="pj-cancel-add-btn">Cancel</button>
                <button class="pj-btn pj-btn-primary" id="pj-save-prompt-btn">Save</button>
            </div>
        `;
        addView.appendChild(addFooter);

        overlay.appendChild(listView);
        overlay.appendChild(addView);
        shadow.appendChild(overlay);

        // -- LOGIC --
        // Use cached global variable if available, otherwise array
        let allPrompts = window.pjCachePrompts || [];
        let selectedIndex = -1;
        let filteredPrompts = [];
        let editingIndex = null;

        const closeOverlay = () => removeOverlay(host);

        listHeader.querySelector('.pj-close-btn').addEventListener('click', (e) => {
            e.stopPropagation(); closeOverlay();
        });

        function openManagementView(title, nameVal, promptVal) {
            listView.style.display = 'none';
            addView.style.display = 'flex';

            // Re-render header content to include icon if title changes, or just update text span?
            // Simpler to just rebuild innerHTML to ensure consistency
            addHeader.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;">
                    <img src="${chrome.runtime.getURL('assets/icon48.png')}" style="width:20px;height:20px;">
                    <span>${title}</span>
                </div>
            `;

            const nameInput = shadow.getElementById('pj-new-prompt-name');
            const textInput = shadow.getElementById('pj-new-prompt-text');
            nameInput.value = nameVal;
            textInput.value = promptVal;

            overlay.classList.add('pj-modal-state');
            overlay.style.top = '';
            overlay.style.left = '';
            overlay.style.bottom = '';

            setTimeout(() => {
                const nameInput = shadow.getElementById('pj-new-prompt-name');
                if (nameInput) nameInput.focus();
            }, 50);
        }

        // Expose function for context menu action
        window.pjOpenAddPrompt = (text) => {
            editingIndex = null;
            openManagementView('New Prompt', '', text);
        };

        const handleEdit = (prompt) => {
            const realIndex = allPrompts.indexOf(prompt);
            editingIndex = realIndex;
            openManagementView('Edit Prompt', prompt.name, prompt.prompt);
        };

        // Open Add View (New)
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            editingIndex = null;
            openManagementView('New Prompt', '', '');
        });

        // Cancel Add (Back to Dropdown)
        const cancelBtn = shadow.getElementById('pj-cancel-add-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                addView.style.display = 'none';
                listView.style.display = 'block';

                // Restore Dropdown State
                restoreDropdownPosition();

                searchInput.focus();
            });
        }

        // AI Optimization Logic
        const optimizeBtn = shadow.getElementById('pj-optimize-btn');

        if (optimizeBtn) {
            optimizeBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();

                // Fetch settings from storage directly
                const result = await chrome.storage.local.get(['pjApiKey', 'pjModel', 'pjSystemPrompt']);
                const apiKey = result.pjApiKey ? result.pjApiKey.trim() : '';
                const model = result.pjModel ? result.pjModel.trim() : 'mistralai/mistral-7b-instruct:free';
                const systemPrompt = result.pjSystemPrompt ? result.pjSystemPrompt.trim() : "You are an expert prompt engineer. Refine the following prompt to be concise, clear, and highly effective for an LLM. Return ONLY the refined prompt text. be as descriptive as possible.";

                const textInput = shadow.getElementById('pj-new-prompt-text');
                const currentText = textInput.value.trim();

                if (!currentText) {
                    alert('Please enter some prompt text to optimize.');
                    return;
                }

                if (!apiKey) {
                    alert('API Key Missing! ⚠️\n\nPlease click the PromptInject extension icon in your browser toolbar (top right) and add your OpenRouter API Key in the settings popup.');
                    return;
                }

                // Loading State
                const originalBtnText = optimizeBtn.innerHTML;
                optimizeBtn.innerHTML = '⏳';
                optimizeBtn.disabled = true;

                try {
                    // Send message to background script to handle API call (bypassing CORS)
                    chrome.runtime.sendMessage({
                        action: 'optimize_prompt',
                        apiKey: apiKey,
                        model: model,
                        systemPrompt: systemPrompt,
                        prompt: currentText
                    }, (response) => {
                        optimizeBtn.innerHTML = originalBtnText;
                        optimizeBtn.disabled = false;

                        if (chrome.runtime.lastError) {
                            console.error("Runtime error:", chrome.runtime.lastError);
                            alert("Error: " + chrome.runtime.lastError.message);
                            return;
                        }

                        if (response && response.success) {
                            textInput.value = response.text;
                        } else {
                            const msg = response ? response.error : "Unknown error";
                            console.error("Optimization failed:", msg);
                            alert("Optimization failed: " + msg);
                        }
                    });
                } catch (err) {
                    optimizeBtn.innerHTML = originalBtnText;
                    optimizeBtn.disabled = false;
                    console.error("Optimization request failed:", err);
                    alert("Optimization request failed: " + err.message);
                }
            });
        }




        // Save (Add or Update)
        const saveBtn = shadow.getElementById('pj-save-prompt-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const nameInput = shadow.getElementById('pj-new-prompt-name');
                const textInput = shadow.getElementById('pj-new-prompt-text');
                const name = nameInput.value.trim();
                const text = textInput.value.trim();

                if (name && text) {
                    chrome.storage.local.get(['prompts'], (result) => {
                        const current = result.prompts || [];

                        if (editingIndex !== null && editingIndex >= 0) {
                            // Update existing
                            if (current[editingIndex]) {
                                current[editingIndex] = { name, prompt: text };
                            }
                        } else {
                            // Add new
                            current.push({ name, prompt: text });
                        }

                        chrome.storage.local.set({ prompts: current }, () => {
                            // Reload
                            allPrompts = current;
                            window.pjCachePrompts = allPrompts;
                            filteredPrompts = allPrompts;
                            selectedIndex = -1;
                            renderPrompts(list, filteredPrompts, host, selectedIndex, target, closeOverlay, handleEdit);

                            // Reset and Switch back
                            nameInput.value = '';
                            textInput.value = '';
                            addView.style.display = 'none';
                            listView.style.display = 'block';
                            restoreDropdownPosition();
                            searchInput.value = '';
                            searchInput.focus();
                        });
                    });
                }
            });
        }

        // Search & Load
        const loadPrompts = () => {
            chrome.storage.local.get(['prompts'], (result) => {
                allPrompts = result.prompts || [];
                window.pjCachePrompts = allPrompts; // Cache for next time
                filteredPrompts = allPrompts;
                renderPrompts(list, filteredPrompts, host, selectedIndex, target, closeOverlay, handleEdit);
            });
        };
        window.pjLoadPrompts = loadPrompts;

        // Initial fast render if cache exists
        if (allPrompts.length > 0) {
            filteredPrompts = allPrompts;
            renderPrompts(list, filteredPrompts, host, selectedIndex, target, closeOverlay, handleEdit);
            // Silently update in background
            loadPrompts();
        } else {
            loadPrompts();
        }

        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            // Optimization: limit filtering if list is massive, but JS filter is usually fast for < 1000 items
            filteredPrompts = allPrompts.filter(p =>
                (p.name && p.name.toLowerCase().includes(term)) ||
                (p.prompt && p.prompt.toLowerCase().includes(term))
            );
            selectedIndex = -1;
            if (filteredPrompts.length > 0) selectedIndex = 0;
            renderPrompts(list, filteredPrompts, host, selectedIndex, target, closeOverlay, handleEdit);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (filteredPrompts.length > 0) {
                    selectedIndex = Math.min(selectedIndex + 1, filteredPrompts.length - 1);
                    updateSelection(list, selectedIndex);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (filteredPrompts.length > 0) {
                    selectedIndex = Math.max(selectedIndex - 1, 0);
                    updateSelection(list, selectedIndex);
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < filteredPrompts.length) {
                    insertPrompt(filteredPrompts[selectedIndex].prompt, target);
                    closeOverlay();
                }
            } else if (e.key === 'Escape') {
                closeOverlay();
            }
        });

        setTimeout(() => searchInput.focus(), 50);
    }

    function removeOverlay(host) {
        if (host && host.parentNode) {
            host.parentNode.removeChild(host);
        }
    }

    function updateSelection(listElement, index) {
        const items = listElement.querySelectorAll('.pj-prompt-item');
        items.forEach((item, i) => {
            if (i === index) {
                item.classList.add('pj-selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('pj-selected');
            }
        });
    }

    function renderPrompts(listElement, prompts, host, selectedIndex, target, closeFn, onEdit) {
        // Optimization: Clear using fast method
        while (listElement.firstChild) {
            listElement.removeChild(listElement.firstChild);
        }

        if (prompts.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'No prompts found.';
            empty.style.padding = '12px';
            empty.style.fontSize = '13px';
            empty.style.color = '#555';
            empty.style.textAlign = 'center';
            listElement.appendChild(empty);
            return;
        }

        // Optimization: Use DocumentFragment to prevent layout thrashing
        const fragment = document.createDocumentFragment();

        // Optimization: Cap rendered items if list is huge (e.g. > 50)
        const maxItems = 50;
        const renderCount = Math.min(prompts.length, maxItems);

        for (let i = 0; i < renderCount; i++) {
            const prompt = prompts[i];
            const li = document.createElement('li');
            li.className = 'pj-prompt-item';
            if (i === selectedIndex) li.classList.add('pj-selected');

            const contentDiv = document.createElement('div');
            contentDiv.style.flex = '1';
            contentDiv.style.overflow = 'hidden';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'pj-prompt-name';
            nameSpan.textContent = prompt.name;

            const previewSpan = document.createElement('span');
            previewSpan.className = 'pj-prompt-preview';

            const rawText = prompt.prompt || '';
            previewSpan.textContent = rawText.length > 80 ? rawText.substring(0, 80) + '...' : rawText;

            contentDiv.appendChild(nameSpan);
            contentDiv.appendChild(previewSpan);
            li.appendChild(contentDiv);

            if (onEdit) {
                const actionsDiv = document.createElement('div');
                actionsDiv.style.display = 'flex';
                actionsDiv.style.gap = '4px';

                const editBtn = document.createElement('div');
                editBtn.className = 'pj-item-action';
                editBtn.innerHTML = '✎';
                editBtn.title = 'Edit Prompt';
                editBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEdit(prompt);
                };

                const deleteBtn = document.createElement('div');
                deleteBtn.className = 'pj-item-action pj-delete-action';
                deleteBtn.innerHTML = '🗑️';
                deleteBtn.title = 'Delete Prompt';
                deleteBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Confirm delete? maybe direct is fine for now or valid confirmation
                    if (confirm(`Delete prompt "${prompt.name}"?`)) {
                        chrome.storage.local.get(['prompts'], (result) => {
                            const current = result.prompts || [];
                            const updated = current.filter(p => p.name !== prompt.name || p.prompt !== prompt.prompt); // Simple match
                            chrome.storage.local.set({ prompts: updated }, () => {
                                // Reload
                                if (window.pjLoadPrompts) window.pjLoadPrompts();
                            });
                        });
                    }
                };

                actionsDiv.appendChild(editBtn);
                actionsDiv.appendChild(deleteBtn);
                li.appendChild(actionsDiv);
            }

            li.onmousedown = (e) => {
                if (e.target.classList.contains('pj-item-action') || e.target.closest('.pj-item-action')) return;
                e.preventDefault();
                e.stopPropagation();
                insertPrompt(prompt.prompt, target);
                closeFn();
            };

            li.onmouseenter = () => {
                const prev = listElement.querySelector('.pj-selected');
                if (prev) prev.classList.remove('pj-selected');
                li.classList.add('pj-selected');
            };

            fragment.appendChild(li);
        }

        listElement.appendChild(fragment);
    }

    function insertPrompt(text, explicitTarget) {
        let target = explicitTarget;

        // Fallback detection if target is lost/detached
        if (!target || !target.isConnected) {
            if (lastActiveElement && lastActiveElement.isConnected) {
                target = lastActiveElement;
            } else {
                target = document.activeElement;
            }
        }

        if (!target) {
            console.warn("PromptInject: No active element to insert text into.");
            return;
        }

        // Focus original element before inserting
        target.focus();

        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            const start = target.selectionStart || 0;
            const end = target.selectionEnd || 0;
            const value = target.value || '';

            // Use execCommand for undo history support if possible
            const inserted = document.execCommand('insertText', false, text);

            if (!inserted) {
                // Fallback to value manipulation
                target.value = value.substring(0, start) + text + value.substring(end);
                target.selectionStart = target.selectionEnd = start + text.length;

                // Dispatch events to trigger JS listeners (e.g. React/masked inputs)
                target.dispatchEvent(new Event('input', { bubbles: true }));
                target.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        else if (target.isContentEditable) {
            const success = document.execCommand('insertText', false, text);

            if (!success) {
                // Manual fallback for contentEditable
                const textNode = document.createTextNode(text);
                const range = window.getSelection().getRangeAt(0);
                range.deleteContents();
                range.insertNode(textNode);
                range.collapse(false);

                const event = new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                    inputType: 'insertText',
                    data: text
                });
                target.dispatchEvent(event);
            }

        }
    }

})();
