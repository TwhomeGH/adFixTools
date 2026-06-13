(() => {
    'use strict';

    let opts = { speed: 2, muteAd: true, showNotification: true, blockHomeAds: true, collapsePanelAds: true, collapseCooldown: 15, incrementalSpeed: false, enabled: true, debugMode: false, hideChat: false };
    let wasAd = false;
    let lastSkip = 0;
    let toastEl = null;
    let adOverlayEl = null;
    let adTitle = '';
    let adStartTime = 0;
    let inspectedAd = false;
    let lastPrintedAd = '';
    const panelCooldowns = new Map();

    const CLOSE_BTN_SEL = 'yt-live-chat-renderer #close-button, ytd-live-chat-frame #close-button, [aria-label="Close chat"], [aria-label="關閉聊天室"], yt-live-chat-renderer yt-icon-button#close-button, #chat:not([hidden]) yt-icon-button';
    let chatObserver = null;
    let chatTimer = null;
    let lastChatHideTime = 0;
    let chatCooldownTimer = null;
    let chatPaused = false;
    let lastChatVisible = false;
    const resumeAutoHide = () => {
        if (chatCooldownTimer) { clearTimeout(chatCooldownTimer); chatCooldownTimer = null; }
        chatPaused = false;
        console.log('[SkipAds] Chat auto-hide resumed');
    };
    const pauseAutoHide = () => {
        if (chatPaused) return;
        chatPaused = true;
        const cd = opts.hideChatCooldown || 0;
        if (chatCooldownTimer) clearTimeout(chatCooldownTimer);
        if (cd === 0) {
            console.log('[SkipAds] Chat auto-hide paused indefinitely (user opened chat)');
        } else {
            chatCooldownTimer = setTimeout(resumeAutoHide, cd * 1000);
            console.log(`[SkipAds] Chat auto-hide paused for ${cd}s`);
        }
    };
    const hideLiveChat = () => {
        if (!opts.hideChat || chatPaused) return;
        if (Date.now() - lastChatHideTime < 1000) return;
        lastChatHideTime = Date.now();
        
        const chat = document.querySelector('yt-live-chat-renderer, ytd-live-chat-frame, #chat, #chat-container, #live-chat, #chat-messages, yt-live-chat-frame');
        if (!chat) return;
        const ytIconBtn = chat.querySelector('yt-icon-button#close-button');
        const innerBtn = chat.querySelector('yt-icon-button#close-button button, #close-button button');
        const anyBtn = chat.querySelector('[aria-label="Close chat"], [aria-label="關閉聊天室"]');
        const closeEl = chat.querySelector('#close-button');
        if (closeEl) debug('hideLiveChat: #close-button html:', closeEl.outerHTML.slice(0, 500));
        if (chat.parentElement) {
            const p = chat.parentElement;
            debug('hideLiveChat: chat parent:', p.tagName, 'id:', p.id, 'class:', p.className.slice(0, 100), 'children:', p.children.length);
            if (p.parentElement) debug('hideLiveChat: grandparent:', p.parentElement.tagName, 'id:', p.parentElement.id, 'class:', p.parentElement.className.slice(0, 100));
        }
        debug('hideLiveChat: chat offsetWidth:', chat.offsetWidth, 'chat boundingRect:', JSON.stringify(chat.getBoundingClientRect()));
        debug('hideLiveChat: yt-icon-button:', !!ytIconBtn, 'inner button:', !!innerBtn, 'aria-label btn:', !!anyBtn);
        if (ytIconBtn) {
            debug('hideLiveChat: clicking yt-icon-button#close-button');
            ytIconBtn.click();
            console.log('[SkipAds] Live chat closed');
        } else if (innerBtn) {
            debug('hideLiveChat: clicking inner button');
            innerBtn.click();
            console.log('[SkipAds] Live chat closed');
        } else if (anyBtn) {
            debug('hideLiveChat: clicking aria-label button:', anyBtn.tagName);
            anyBtn.click();
            console.log('[SkipAds] Live chat closed');
        } else {
            chat.style.display = 'none';
            console.log('[SkipAds] Live chat hidden (fallback)');
        }
    };
    const isChatVisible = (chat) => {
        return chat && chat.style.display !== 'none' && chat.offsetWidth > 0 && chat.offsetHeight > 0;
    };
    const watchChat = () => {
        if (chatObserver) { chatObserver.disconnect(); chatObserver = null; }
        if (chatTimer) { clearInterval(chatTimer); chatTimer = null; }
        if (chatCooldownTimer) { clearTimeout(chatCooldownTimer); chatCooldownTimer = null; }
        chatPaused = false;
        lastChatVisible = false;
        if (!opts.hideChat) return;
        hideLiveChat();
        // 等待關閉動畫完成再啟動監聽，避免誤判
        setTimeout(() => {
            if (!opts.hideChat) return;
            chatTimer = setInterval(() => {
                if (!opts.hideChat || chatPaused) return;
                const chat = document.querySelector('yt-live-chat-renderer, ytd-live-chat-frame, #chat, #chat-container, #live-chat, #chat-messages, yt-live-chat-frame');
                const visible = isChatVisible(chat);
                if (!visible) {
                    lastChatVisible = false;
                    return;
                }
                if (!lastChatVisible) {
                    console.log('[SkipAds] User opened chat, pausing auto-hide');
                    pauseAutoHide();
                }
                lastChatVisible = true;
                if (document.querySelector(CLOSE_BTN_SEL)) {
                    console.log('[SkipAds] Chat re-appeared, clicking close button');
                    hideLiveChat();
                } else {
                    chat.style.display = 'none';
                    console.log('[SkipAds] Live chat hidden (fallback)');
                }
            }, 1000);
            chatObserver = new MutationObserver(() => {
                if (!opts.hideChat) { chatObserver.disconnect(); return; }
                const chat = document.querySelector('yt-live-chat-renderer, ytd-live-chat-frame, #chat, #chat-container, #live-chat, #chat-messages, yt-live-chat-frame');
                const visible = isChatVisible(chat);
                if (!visible) {
                    lastChatVisible = false;
                    return;
                }
                if (!lastChatVisible) {
                    console.log('[SkipAds] User opened chat, pausing auto-hide');
                    pauseAutoHide();
                }
                lastChatVisible = true;
                if (document.querySelector(CLOSE_BTN_SEL)) {
                    console.log('[SkipAds] Chat re-appeared, clicking close button');
                    hideLiveChat();
                } else {
                    chat.style.display = 'none';
                    console.log('[SkipAds] Live chat hidden (fallback)');
                }
            });
            chatObserver.observe(document.body || document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        }, 2800);
    };

    const updateAdOverlay = (text) => {
        const p = document.querySelector('#movie_player');
        if (!p) return;
        if (!adOverlayEl) {
            adOverlayEl = document.createElement('div');
            adOverlayEl.id = 'sks-ad-overlay';
            adOverlayEl.style.cssText = 'position:absolute;top:12px;left:12px;z-index:1000;background:rgba(0,0,0,.7);color:#fff;padding:6px 12px;border-radius:4px;font-size:13px;pointer-events:none;max-width:60%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
            p.appendChild(adOverlayEl);
        }
        adOverlayEl.textContent = text || '';
        adOverlayEl.style.display = text ? '' : 'none';
    };
    const debug = (...args) => { if (opts.debugMode) console.log('[SkipAds:debug]', ...args); };
    const inspectAd = () => {
        const ad = document.querySelector('.ytp-ad-player-overlay, .ytp-ad-player-overlay-layout, .ytp-video-interstitial-buttoned-centered-layout, .ytp-ad-survey');
        if (ad) console.log('[SkipAds:inspect] ad layout:', ad.outerHTML.slice(0, 3000));
        const adModule = document.querySelector('.video-ads');
        if (adModule) console.log('[SkipAds:inspect] video-ads:', adModule.outerHTML.slice(0, 3000));
    };

    const AD_CSS = [
        'ytd-display-ad-renderer', 'ytd-statement-banner-renderer', 'ytd-ad-slot-renderer',
        'ytd-promoted-sparkles-web-renderer', 'ytd-compact-promoted-video-renderer',
        'ytd-in-feed-ad-layout-renderer', '#masthead-ad', 'ytd-merch-shelf-renderer',
        'ytd-promoted-video-renderer', 'ytd-video-masthead-ad-v3-renderer'
    ].join(',') + '{display:none!important}';

    const injectAdBlockStyle = () => {
        if (document.getElementById('sks-adblock')) return;
        const s = document.createElement('style');
        s.id = 'sks-adblock';
        s.textContent = AD_CSS;
        document.head.appendChild(s);
    };

    const getAdInfo = () => {
        const parts = [];
        const singleSels = [
            '.ytp-ad-avatar-lockup-card__headline',
            '.ytp-ad-title',
            '.ytp-ad-headline',
            '.ytp-ad-destination',
            '.ytp-ad-visit-advertiser-btn .ytp-ad-button-text',
            '.ytp-ad-simple-ad-badge',
            '.ytp-ad-badge-text',
            '.ytp-ad-player-overlay-text',
            '.ytp-ad-simple-ad-badge--survey'
            
        ];
        const multiSels = [
            '.ytp-ad-badge__text--clean-player',
            '.ad-simple-attributed-string',
            '.ytp-video-interstitial-buttoned-centered-layout [class*="ad-simple-attributed-string"]'
        ];
        for (const sel of singleSels) {
            const el = document.querySelector(sel);
            if (el) {
                const t = el.textContent.trim();
                if (t && t !== 'Ad') parts.push(t);
            }
        }
        for (const sel of multiSels) {
            for (const el of document.querySelectorAll(sel)) {
                const t = el.textContent.trim();
                if (t && t !== 'Ad') parts.push(t);
            }
        }


        const skipBtns = document.querySelectorAll('[id^="skip-button:"], .ytp-ad-skip-button, .ytp-skip-ad-button, .ytp-ad-skip-button-modern');
        skipBtns.forEach(skipBtn => {
            const t = skipBtn.textContent.trim();
            if (t && t !== 'Skip ad' && t !== 'Skip' && t !== '略過') parts.push(t);

            const btn = skipBtn.querySelector('button') || skipBtn;
            ['mousedown', 'mouseup', 'click'].forEach(type => {
                btn.dispatchEvent(new MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    buttons: 1
                }));
            });
            debug('Clicked skip button:', skipBtn.id || skipBtn.className);
        });
        const overlayTexts = [...document.querySelectorAll('.ytp-ad-player-overlay *')].map(e => e.textContent.trim()).filter(Boolean);
        parts.push(...overlayTexts);
        const unique = [...new Set(parts)];
        if (unique.length) return unique.join(' · ');
        const v = document.querySelector('#movie_player video');
        if (v && v.duration > 0) {
            const secs = Math.round(v.duration);
            if (secs >= 60) return `Ad (${Math.floor(secs / 60)}m${secs % 60}s)`;
            return `Ad (${secs}s)`;
        }
        return 'Ad';
    };

    const showToast = (title) => {
        if (!document.body || opts.showNotification === false) return;
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.id = 'sks-toast';
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = `\u23ED Skipped${title ? ': ' + title : ''}`;
        toastEl.style.cssText = [
            'position:fixed', 'bottom:16px', 'left:50%', 'transform:translateX(-50%)',
            'z-index:2147483647', 'transition:opacity 0.4s ease',
            'opacity:1', 'background:#77777A', 'color:#fff',
            'padding:10px 16px', 'border-radius:8px', 'font-size:13px'
        ].join(';');
        setTimeout(() => { if (toastEl) toastEl.style.opacity = '0'; }, 2500);
    };

    const findSkipBtn = () => {
        for (const sel of [
            '.ytp-ad-skip-button', '.ytp-skip-ad-button',
            'button.ytp-ad-skip-button-modern',
            '.ytp-ad-skip-button-container button',
            '.ytp-ad-player-overlay-layout__skip-or-preview-container button',
            '.ytp-ad-skip-button-slot button',
            '[aria-label="Skip ad"]', '[aria-label="Skip Ad"]',
            '[aria-label="\u30B9\u30AD\u30C3\u30D7"]',
            '[aria-label="\u8DF3\u8FC7\u5E7F\u544A"]'
        ]) {
            const btn = document.querySelector(sel);
            if (btn) return btn;
        }
        for (const btn of document.querySelectorAll('button')) {
            const t = btn.textContent.trim().toLowerCase();
            if (t === 'skip ad' || t === 'skip' || t === '略過廣告' || t === '略過') return btn;
        }
        return null;
    };

    const collapseAdPanels = () => {
        if (opts.collapsePanelAds === false) return;
        document.querySelectorAll('ytd-engagement-panel-section-list-renderer').forEach(panel => {
            if (panel.getAttribute('visibility') !== 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED') return;
            if (!panel.querySelector('.ytwAdBadgeViewModelHost, panel-ad-header-image-lockup-view-model')) return;
            if (panel.style.display === 'none') return;
            if (panelCooldowns.get(panel) > Date.now()) return;
            panelCooldowns.delete(panel);

            const btn = panel.querySelector(
                'toggle-button-view-model button, ' +
                '.ytwPanelAdHeaderImageLockupViewModelHostHeaderMetadataMenu button, ' +
                'button[aria-pressed]'
            );
            if (btn) {
                btn.click();
                console.log('[SkipAds] Collapsed ad panel');
            } else {
                panel.style.display = 'none';
                console.log('[SkipAds] Hidden ad panel (fallback)');
            }
        });
    };

    document.addEventListener('click', (e) => {
        if (opts.collapsePanelAds === false) return;
        const btn = e.target.closest('toggle-button-view-model button, [aria-pressed]');
        if (!btn) return;
        const panel = btn.closest('ytd-engagement-panel-section-list-renderer');
        if (!panel) return;
        if (!panel.querySelector('.ytwAdBadgeViewModelHost, panel-ad-header-image-lockup-view-model')) return;
        panelCooldowns.set(panel, Date.now() + (opts.collapseCooldown || 15) * 1000);
        console.log('[SkipAds] User toggled ad panel, cooldown ' + (opts.collapseCooldown || 15) + 's');
    });

    const handleSurveyAd = () => {
        const survey = document.querySelector('.ytp-ad-survey');
        if (!survey) return;
        const neutralBtn = survey.querySelector('[aria-label="普通"], [aria-label="Neutral"], [aria-label="Okay"]');
        if (!neutralBtn) return;
        neutralBtn.click();
        console.log('[SkipAds] Survey answered: neutral');
    };

    const calcIncrementalSpeed = (elapsed) => {
        const step = Math.floor(elapsed / 2);
        if (step < 4) return 2 + step * 2;
        return 8 + (step - 3) * 8;
    };

    setInterval(() => {
        collapseAdPanels();
        const p = document.querySelector('#movie_player');
        if (!p) return;
        const v = p.querySelector('video');
        const isAd = p.classList.contains('ad-showing');

        if (opts.enabled !== false) {
            if (isAd) handleSurveyAd();
            if (isAd && v) {
                if (opts.hideChat && !chatPaused) hideLiveChat();
                if (!wasAd) {
                    adTitle = '';
                    adStartTime = Date.now();
                    inspectedAd = false;
                    updateAdOverlay('\u23ED Ad...');
                }
                if (!adTitle) {
                    adTitle = getAdInfo();
                    if (adTitle) {
                        updateAdOverlay('\u23ED ' + adTitle);
                        if (adTitle !== lastPrintedAd) {
                            lastPrintedAd = adTitle;
                            console.log('[SkipAds] Ad started');
                            const adLayout = document.querySelector('.ytp-ad-player-overlay') ? 'overlay' :
                                document.querySelector('.ytp-ad-player-overlay-layout') ? 'overlay-layout' :
                                document.querySelector('.ytp-video-interstitial-buttoned-centered-layout') ? 'interstitial' :
                                document.querySelector('.ytp-ad-survey') ? 'survey' : 'unknown';
                            debug('ad format:', adLayout);
                            debug('badge text:', [...document.querySelectorAll('.ytp-ad-badge, .ytp-ad-simple-ad-badge, .ytp-ad-badge__text--clean-player, .ad-simple-attributed-string')].map(e => e.textContent.trim()).filter(Boolean).join(', '));
                            console.log('[SkipAds] Ad info:', adTitle);
                        }
                    }
                }
                if (opts.incrementalSpeed) {
                    const elapsed = (Date.now() - adStartTime) / 1000;
                    v.playbackRate = calcIncrementalSpeed(elapsed);
                } else {
                    v.playbackRate = opts.speed || 2;
                }
                if (opts.muteAd !== false) v.muted = true;
                wasAd = true;

                const skipBtn = findSkipBtn();
                if (skipBtn) {
                    skipBtn.click();
                    if (v.duration > 0 && v.currentTime < v.duration - 1) {
                        v.currentTime = v.duration - 0.5;
                    }
                    if (Date.now() - lastSkip > 2000) {
                        lastSkip = Date.now();
                        const title = adTitle || getAdInfo();
                        console.log('[SkipAds] Skipped, title:', title);
                        showToast(title);
                    }
                    wasAd = false;
                } else {
                    if (opts.debugMode && !inspectedAd) {
                        inspectedAd = true;
                        debug('No skip button found. Trying to force end ad...');
                        inspectAd();
                    }
                    if (v && v.duration > 0 && v.currentTime < v.duration - 0.5) {
                        v.currentTime = v.duration - 0.5;
                    }
                    const hiddenBtn = document.querySelector('.ytp-ad-skip-button-modern, .ytp-ad-skip-button-slot button, .ytp-video-interstitial-buttoned-centered-layout button');
                    if (hiddenBtn) {
                        hiddenBtn.click();
                        debug('Force clicked hidden skip button');
                    }
                }
            }

            if (!isAd) {
                if (wasAd) {
                    wasAd = false;
                    adTitle = '';
                    inspectedAd = false;
                    lastPrintedAd = '';
                    if (v) { v.playbackRate = 1; v.muted = false; }
                }
                updateAdOverlay('');
            }
        }
    },700);

    chrome.storage.local.get({
        speed: 2, muteAd: true, showNotification: true, blockHomeAds: true, collapsePanelAds: true, collapseCooldown: 15, incrementalSpeed: false, enabled: true, debugMode: false, hideChat: false, hideChatCooldown: 0
    }, (d) => {
        opts = d;
        if (opts.blockHomeAds) {
            const w = () => { document.head ? injectAdBlockStyle() : setTimeout(w, 100); };
            w();
        }
        watchChat();
    });

    chrome.storage.onChanged.addListener((changes) => {
        for (const k of Object.keys(changes)) {
            if (k in opts) opts[k] = changes[k].newValue;
        }
        if ('hideChat' in changes || 'hideChatCooldown' in changes) watchChat();
        if ('enabled' in changes && !changes.enabled.newValue) {
            wasAd = false;
            updateAdOverlay('');
            const v = document.querySelector('#movie_player video');
            if (v) { v.playbackRate = 1; v.muted = false; }
        }
        if ('debugMode' in changes && changes.debugMode.newValue) {
            debug('[SkipAds:debug] Debug mode enabled');
            inspectAd();
        }
        if ('blockHomeAds' in changes) {
            const el = document.getElementById('sks-adblock');
            if (changes.blockHomeAds.newValue) {
                if (document.head && !el) injectAdBlockStyle();
            } else if (el) el.remove();
        }
    });
})();