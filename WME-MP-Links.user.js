// ==UserScript==
// @name         WME MP Links
// @namespace    https://github.com/
// @version      1.0.1-beta.7
// @description  Creates links for one.network URLs on MPs.
// @author       Thynamelessone
// @match        https://www.waze.com/*editor*
// @match        https://beta.waze.com/*editor*
// @exclude      https://www.waze.com/*user/*editor/*
// @grant        none
// @require      https://cdn.jsdelivr.net/gh/TheEditorX/wme-sdk-plus@72968ef0792a3bd673f768f8ee2a10d67653d1ea/wme-sdk-plus.js
// @require      https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// @downloadURL  https://github.com/Thynamelessone/WME-MP-Links/raw/refs/heads/main/WME-MP-Links.user.js
// @updateURL    https://github.com/Thynamelessone/WME-MP-Links/raw/refs/heads/main/WME-MP-Links.user.js
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_ID = "WME-MP-Links";
    const SCRIPT_NAME = "WME MP Links";
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