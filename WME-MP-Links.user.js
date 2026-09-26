// ==UserScript==
// @name         WME MP Links
// @namespace    https://github.com/
// @version      1.0.1-beta.8
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
    const updateMessage = ".";

    if (typeof WazeWrap !== 'undefined' && WazeWrap.Interface) {
        WazeWrap.Interface.ShowScriptUpdate(SCRIPT_NAME, GM_info.script.version, updateMessage);
    }

    const URL_REGEX_TEST = /(?:https?:\/\/|www\.)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s<"'`;,]*)?/i;
    const URL_REGEX_MATCH = /(?:https?:\/\/|www\.)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s<"'`;,]*)?/gi;

    const TAB_TARGET_NAME = 'wme_external_link_tab';
    let sharedWindowRef = null;
    let sdk = null;

    function openInSharedTab(url) {
        const fullUrl = url.startsWith('www.') ? `https://${url}` : url;
        if (!sharedWindowRef || sharedWindowRef.closed) {
            sharedWindowRef = window.open(fullUrl, TAB_TARGET_NAME);
        } else {
            sharedWindowRef.location.href = fullUrl;
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
        if (
            !parent ||
            ['A', 'SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'NOSCRIPT'].includes(parent.tagName) ||
            parent.dataset.wmeLinkified === "true"
        ) {
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
            const href = match.startsWith('www.') ? `https://${match}` : match;
            anchor.href = href;
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

        parent.dataset.wmeLinkified = "true";
        parent.replaceChild(fragment, node);
    }

    function scanRootForLinks(root) {
        if (!root) return;

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        const nodes = [];
        while (walker.nextNode()) {
            nodes.push(walker.currentNode);
        }
        nodes.forEach(linkifyNode);

        const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
        for (const el of elements) {
            if (el.shadowRoot) {
                scanRootForLinks(el.shadowRoot);
            }
        }
    }

    let scanTimeout = null;
    function triggerScan() {
        if (scanTimeout) clearTimeout(scanTimeout);
        scanTimeout = setTimeout(() => {
            const targets = [
                document.getElementById('sidebarContent'),
                document.getElementById('edit-panel'),
                document.querySelector('.problem-detail'),
                document.querySelector('.map-problem-detail'),
                document.querySelector('.modal-content'),
            ].filter(Boolean);

            if (targets.length > 0) {
                targets.forEach(scanRootForLinks);
            } else {
                scanRootForLinks(document.body);
            }
        }, 200);
    }

    function setupObserver() {
        const observer = new MutationObserver((mutations) => {
            let shouldScan = false;
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    shouldScan = true;
                    break;
                }
            }
            if (shouldScan) triggerScan();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        triggerScan();
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

            setupObserver();
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