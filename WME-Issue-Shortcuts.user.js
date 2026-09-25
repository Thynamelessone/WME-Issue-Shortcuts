// ==UserScript==
// @name         WME Issue Shortcuts
// @namespace    https://github.com/
// @version      1.0.1-beta.1
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
    let sharedWindowRef = null;
    let sdk = null;
    let currentURId = null;

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

    function findAndClickButton(matchTexts, containerSelector = null) {
        const context = containerSelector 
            ? document.querySelector(containerSelector) 
            : document;

        if (!context) return false;

        const btn = Array.from(context.querySelectorAll('button, .btn, wz-button'))
            .find(b => {
                const txt = (b.textContent || b.innerText || '').trim().toLowerCase();
                return matchTexts.some(target => txt === target.toLowerCase() || txt.includes(target.toLowerCase()));
            });

        if (btn && typeof btn.click === 'function') {
            btn.click();
            return true;
        }
        return false;
    }

    function handleUnifiedSolve() {
        // 1. Map Problems (MP)
        if (findAndClickButton(['solved', 'solve'], '.map-problem-detail, .modal-content, [class*="problem"]')) {
            return;
        }

        // 2. Place Update Requests (PUR)
        if (findAndClickButton(['approve', 'accept'], '.venue-update-request, [class*="venue-update"], [data-testid*="pur"]')) {
            return;
        }

        // 3. Map Suggestions (MS)
        if (findAndClickButton(['apply', 'approve', 'accept'], '.suggestion-detail, [class*="suggestion"], [class*="map-suggestion"]')) {
            return;
        }

        // 4. Fallback Generic Button Search for MP/PUR/MS
        if (findAndClickButton(['solved', 'approve', 'accept'])) {
            return;
        }

        // 5. Update Requests (UR) via WME SDK
        if (currentURId && sdk?.DataModel?.MapUpdateRequests) {
            try {
                sdk.DataModel.MapUpdateRequests.updateResolutionState({
                    mapUpdateRequestId: currentURId,
                    resolutionState: 'solved',
                });
            } catch (e) {
                console.error(`[${SCRIPT_NAME}] Failed to mark UR as solved:`, e);
            }
        }
    }

    function handleUnifiedNotApplicable() {
        // 1. Map Problems (MP)
        if (findAndClickButton(['not applicable', 'not_applicable'], '.map-problem-detail, .modal-content, [class*="problem"]')) {
            return;
        }

        // 2. Place Update Requests (PUR)
        if (findAndClickButton(['reject', 'deny'], '.venue-update-request, [class*="venue-update"], [data-testid*="pur"]')) {
            return;
        }

        // 3. Map Suggestions (MS)
        if (findAndClickButton(['reject', 'dismiss', 'ignore'], '.suggestion-detail, [class*="suggestion"], [class*="map-suggestion"]')) {
            return;
        }

        // 4. Fallback Generic Button Search for MP/PUR/MS
        if (findAndClickButton(['not applicable', 'reject', 'dismiss'])) {
            return;
        }

        // 5. Update Requests (UR) via WME SDK
        if (currentURId && sdk?.DataModel?.MapUpdateRequests) {
            try {
                sdk.DataModel.MapUpdateRequests.updateResolutionState({
                    mapUpdateRequestId: currentURId,
                    resolutionState: 'not-identified',
                });
            } catch (e) {
                console.error(`[${SCRIPT_NAME}] Failed to mark UR as not identified:`, e);
            }
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

    function registerKeyboardShortcuts() {
        registerShortcut({
            shortcutId: SHORTCUT_IDS.solve,
            description: "Solve MP / UR / PUR / MS",
            shortcutKeys: DEFAULT_SHORTCUTS.solve,
            callback: handleUnifiedSolve,
        });

        registerShortcut({
            shortcutId: SHORTCUT_IDS.notApplicable,
            description: "Not Applicable / Reject MP / UR / PUR / MS",
            shortcutKeys: DEFAULT_SHORTCUTS.notApplicable,
            callback: handleUnifiedNotApplicable,
        });
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
                    currentURId = e.updateRequestId ?? null;
                },
            });
            sdk.Events.on({
                eventName: 'wme-selection-changed',
                eventHandler: function () {
                    const sel = sdk.Editing?.getSelection?.();
                    if (!sel || sel.objectType !== 'mapUpdateRequest') {
                        currentURId = null;
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
                    const sdkPlus = await initWmeSdkPlus(wmeSdk);
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