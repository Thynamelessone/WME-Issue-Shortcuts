// ==UserScript==
// @name         WME Issue Shortcuts
// @namespace    https://github.com/
// @version      1.0.1-beta.6
// @description  Creates links for one.network URLs on MPs and adds keyboard shortcuts for MPs, URs, PURs, and MS.
// @author       Thynamelessone
// @match        https://www.waze.com/*editor*
// @match        https://beta.waze.com/*editor*
// @exclude      https://www.waze.com/*user/*editor/*
// @grant        none
// @require      https://cdn.jsdelivr.net/gh/TheEditorX/wme-sdk-plus@72968ef0792a3bd673f768f8ee2a10d67653d1ea/wme-sdk-plus.js
// @require      https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// @downloadURL  https://github.com/Thynamelessone/WME-Issue-Shortcuts/raw/refs/heads/main/WME-Issue-Shortcuts.user.js
// @updateURL    https://github.com/Thynamelessone/WME-Issue-Shortcuts/raw/refs/heads/main/WME-Issue-Shortcuts.user.js
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_ID = "WME-Issue-Shortcuts";
    const SCRIPT_NAME = "WME Issue Shortcuts";
    const updateMessage = "";

    if (typeof WazeWrap !== 'undefined' && WazeWrap.Interface) {
        WazeWrap.Interface.ShowScriptUpdate(SCRIPT_NAME, GM_info.script.version, updateMessage);
    }

    const SHORTCUT_GROUP_ID = `${SCRIPT_ID}-shortcuts`;

    const SHORTCUT_IDS = {
        solve: `${SCRIPT_ID}-solve-action`,
        notApplicable: `${SCRIPT_ID}-not-applicable-action`,
    };
    
    const DEFAULT_SHORTCUTS = {
        solve: null,
        notApplicable: null,
    };

    const URL_REGEX_TEST = /https?:\/\/(?:[a-zA-Z0-9-]+\.)?one\.network\/[^\s<"'`;,]+/i;
    const URL_REGEX_MATCH = /https?:\/\/(?:[a-zA-Z0-9-]+\.)?one\.network\/[^\s<"'`;,]+/gi;

    const TAB_TARGET_NAME = 'one_network_shared_tab';
    const SHORTCUT_STORAGE_KEY = `${SCRIPT_ID}-saved-shortcuts`;

    let sharedWindowRef = null;
    let sdk = null;

    let currentActiveSelection = { type: null, id: null };

    function openInSharedTab(url) {
        if (!sharedWindowRef || sharedWindowRef.closed) {
            sharedWindowRef = window.open(url, TAB_TARGET_NAME);
        } else {
            sharedWindowRef.location.href = url;
            sharedWindowRef.focus();
        }
    }

    function linkifyNode(node) {
        if (
            node.nodeType !== Node.TEXT_NODE ||
            !node.nodeValue ||
            !URL_REGEX_TEST.test(node.nodeValue)
        ) {
            return;
        }

        const parent = node.parentNode;
        if (!parent || ['A', 'SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA'].includes(parent.tagName)) {
            return;
        }

        const text = node.nodeValue;
        const fragment = document.createDocumentFragment();
        let lastIdx = 0;

        text.replace(URL_REGEX_MATCH, (match, offset) => {
            if (offset > lastIdx) {
                fragment.appendChild(document.createTextNode(text.slice(lastIdx, offset)));
            }

            const anchor = document.createElement('a');
            anchor.href = match;
            anchor.innerText = match;
            anchor.style.color = '#33a3dc';
            anchor.style.textDecoration = 'underline';
            anchor.style.fontWeight = 'bold';
            anchor.style.cursor = 'pointer';

            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openInSharedTab(match);
            });

            fragment.appendChild(anchor);
            lastIdx = offset + match.length;
        });

        if (lastIdx < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIdx)));
        }

        parent.replaceChild(fragment, node);
    }

    function processContainer(selector) {
        const containers = document.querySelectorAll(selector);
        containers.forEach(container => {
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
            const nodes = [];
            while (walker.nextNode()) {
                nodes.push(walker.currentNode);
            }
            nodes.forEach(linkifyNode);
        });
    }

    function scanForOneNetworkLinks() {
        const selectors = [
            '#sidebarContent',
            '.problem-detail',
            '.map-problem-detail',
            '.modal-content',
            '.edit-panel',
            '.closure-detail',
            'div[class*="problem"]',
            'div[class*="panel"]'
        ];

        selectors.forEach(processContainer);
    }

    // Deep search through DOM and Shadow DOM roots for matching buttons
    function findAndClickDeepButton(targetTexts) {
        function searchRoot(root) {
            if (!root) return null;

            // Search buttons inside current root
            const buttons = Array.from(root.querySelectorAll('button, .btn, wz-button'));
            for (const btn of buttons) {
                const txt = (btn.textContent || btn.innerText || '').trim().toLowerCase();
                if (targetTexts.some(t => txt === t || (txt.length < 20 && txt.includes(t)))) {
                    return btn;
                }
            }

            // Traverse shadow DOMs
            const allNodes = Array.from(root.querySelectorAll('*'));
            for (const node of allNodes) {
                if (node.shadowRoot) {
                    const found = searchRoot(node.shadowRoot);
                    if (found) return found;
                }
            }
            return null;
        }

        const foundBtn = searchRoot(document);
        if (foundBtn && typeof foundBtn.click === 'function') {
            foundBtn.click();
            return true;
        }
        return false;
    }

    function handleUnifiedAction(actionType) {
        const W = typeof window !== "undefined" ? window.W : undefined;
        const isSolve = actionType === 'solve';

        // 1. Check if a Map Problem (MP) button exists on screen (including inside Shadow DOMs)
        const mpTargetTexts = isSolve ? ['solved', 'solve'] : ['not applicable', 'not_applicable'];
        if (findAndClickDeepButton(mpTargetTexts)) {
            return;
        }

        // 2. Handle active selection via SDK models (UR, PUR, MS)
        const { type, id } = currentActiveSelection;

        if (!type || !id) {
            console.debug(`[${SCRIPT_NAME}] No active selection detected.`);
            return;
        }

        switch (type) {
            // Update Requests (UR)
            case 'mapUpdateRequest':
            case 'ur':
                if (sdk?.DataModel?.MapUpdateRequests) {
                    sdk.DataModel.MapUpdateRequests.updateResolutionState({
                        mapUpdateRequestId: id,
                        resolutionState: isSolve ? 'solved' : 'not-identified',
                    });
                }
                break;

            // Place Update Requests (PUR)
            case 'venueUpdateRequest':
            case 'pur':
                if (sdk?.DataModel?.VenueUpdateRequests) {
                    if (isSolve) {
                        sdk.DataModel.VenueUpdateRequests.accept({ venueUpdateRequestId: id });
                    } else {
                        sdk.DataModel.VenueUpdateRequests.reject({ venueUpdateRequestId: id });
                    }
                } else if (W?.model?.venueUpdateRequests) {
                    const pur = W.model.venueUpdateRequests.getObjectById(id) || W.model.venueUpdateRequests.objects[id];
                    if (pur) {
                        if (isSolve) pur.accept();
                        else pur.reject();
                    }
                }
                break;

            // Map Suggestions (MS)
            case 'mapSuggestion':
            case 'ms':
            case 'suggestion':
                if (sdk?.DataModel?.MapSuggestions) {
                    if (isSolve) {
                        sdk.DataModel.MapSuggestions.accept({ suggestionId: id });
                    } else {
                        sdk.DataModel.MapSuggestions.reject({ suggestionId: id });
                    }
                } else if (W?.model?.mapSuggestions) {
                    const ms = W.model.mapSuggestions.getObjectById(id) || W.model.mapSuggestions.objects[id];
                    if (ms) {
                        if (isSolve) ms.accept();
                        else ms.reject();
                    }
                }
                break;

            default:
                console.debug(`[${SCRIPT_NAME}] Unsupported object type: ${type}`);
                break;
        }
    }

    function registerShortcutGroup() {
        if (!sdk?.Shortcuts?.addShortcutGroup) {
            return false;
        }

        try {
            sdk.Shortcuts.addShortcutGroup({ groupId: SHORTCUT_GROUP_ID, groupName: SCRIPT_NAME });
            return true;
        } catch (error) {
            return true;
        }
    }

    function registerShortcut({ shortcutId, description, shortcutKeys, callback }) {
        try {
            if (sdk.Shortcuts.isShortcutRegistered({ shortcutId })) {
                sdk.Shortcuts.deleteShortcut({ shortcutId });
            }

            try {
                sdk.Shortcuts.createShortcut({ callback, description, shortcutId, shortcutKeys });
                return true;
            } catch (error) {
                sdk.Shortcuts.createShortcut({ callback, description, shortcutId, shortcutKeys: null });
                return true;
            }
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Failed to register ${description}.`, error);
            return false;
        }
    }

    function parseSdkKeysToString(rawKeys) {
        if (!rawKeys) return null;
        if (typeof rawKeys === 'string' && !/^\d+,-?\d+$/.test(rawKeys)) {
            return rawKeys;
        }
        const match = /^(\d+),(-?\d+)$/.exec(String(rawKeys));
        if (!match) return String(rawKeys);

        const mask = Number(match[1]);
        const key = Number(match[2]);
        if (key < 0) return null;

        const mods = [
            mask & 4 ? 'A' : '',
            mask & 1 ? 'C' : '',
            mask & 2 ? 'S' : '',
        ].join('');

        return mods ? `${mods}+${key}` : String(key);
    }

    function getStoredShortcutKeys() {
        try {
            return JSON.parse(localStorage.getItem(SHORTCUT_STORAGE_KEY)) ?? {};
        } catch (e) {
            return {};
        }
    }

    function saveShortcutKeys() {
        if (!sdk?.Shortcuts?.getAllShortcuts) return;
        try {
            const currentShortcuts = sdk.Shortcuts.getAllShortcuts();
            const savedState = {};

            currentShortcuts.forEach(sc => {
                if (sc.shortcutId && sc.shortcutId.startsWith(SCRIPT_ID)) {
                    savedState[sc.shortcutId] = parseSdkKeysToString(sc.shortcutKeys);
                }
            });

            localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(savedState));
        } catch (e) {
            console.error(`[${SCRIPT_NAME}] Failed to save shortcuts to localStorage:`, e);
        }
    }

    function registerKeyboardShortcuts() {
        const storedKeys = getStoredShortcutKeys();

        registerShortcut({
            shortcutId: SHORTCUT_IDS.solve,
            description: "Solve MP / UR / PUR / MS",
            shortcutKeys: parseSdkKeysToString(storedKeys[SHORTCUT_IDS.solve]) ?? DEFAULT_SHORTCUTS.solve,
            callback: () => handleUnifiedAction('solve'),
        });

        registerShortcut({
            shortcutId: SHORTCUT_IDS.notApplicable,
            description: "Not Applicable / Reject MP / UR / PUR / MS",
            shortcutKeys: parseSdkKeysToString(storedKeys[SHORTCUT_IDS.notApplicable]) ?? DEFAULT_SHORTCUTS.notApplicable,
            callback: () => handleUnifiedAction('notApplicable'),
        });

        window.addEventListener('beforeunload', saveShortcutKeys);
        window.addEventListener('pagehide', saveShortcutKeys);
    }

    function watchDOMAndEvents() {
        const observer = new MutationObserver((mutations) => {
            let shouldScan = false;
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    shouldScan = true;
                    break;
                }
            }
            if (shouldScan) {
                scanForOneNetworkLinks();
            }
        });

        const targetNode = document.getElementById('app-container') || document.body;
        observer.observe(targetNode, { childList: true, subtree: true });
        scanForOneNetworkLinks();

        if (sdk?.Events) {
            sdk.Events.on({
                eventName: 'wme-update-request-panel-opened',
                eventHandler: function (e) {
                    currentActiveSelection = { type: 'mapUpdateRequest', id: e.updateRequestId ?? null };
                },
            });

            sdk.Events.on({
                eventName: 'wme-selection-changed',
                eventHandler: function () {
                    try {
                        const sel = sdk.Editing?.getSelection?.();
                        if (sel && sel.ids?.length > 0) {
                            currentActiveSelection = {
                                type: sel.objectType,
                                id: sel.ids[0]
                            };
                        } else {
                            currentActiveSelection = { type: null, id: null };
                        }
                    } catch (e) {
                        currentActiveSelection = { type: null, id: null };
                    }
                },
            });
        }
    }

    async function initialise() {
        try {
            console.log(`[${SCRIPT_NAME}] Initialising...`);

            if (typeof getWmeSdk !== "function") throw new Error("WME SDK is unavailable.");

            const wmeSdk = getWmeSdk({ scriptId: SCRIPT_ID, scriptName: SCRIPT_NAME });

            await wmeSdk.Events.once({ eventName: "wme-ready" });
            sdk = wmeSdk;

            if (typeof initWmeSdkPlus === "function") {
                try {
                    const sdkPlus = await initWmeSdkPlus(wmeSdk, {
                        hooks: ["DataModel.MapProblems", "DataModel.VenueUpdateRequests", "DataModel.MapSuggestions"]
                    });
                    if (sdkPlus) sdk = sdkPlus;
                } catch (e) {
                    console.warn(`[${SCRIPT_NAME}] wme-sdk-plus init skipped:`, e);
                }
            }

            registerShortcutGroup();
            registerKeyboardShortcuts();
            watchDOMAndEvents();

            console.log(`[${SCRIPT_NAME}] Initialisation complete.`);
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Initialisation failed.`, error);
        }
    }

    if (window.SDK_INITIALIZED && typeof window.SDK_INITIALIZED.then === "function") {
        window.SDK_INITIALIZED.then(initialise);
    } else {
        console.error(`[${SCRIPT_NAME}] SDK_INITIALIZED is unavailable.`);
    }
})();