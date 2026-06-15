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
    let adOriginalMuted = false;
    const panelCooldowns = new Map();
    const MAX_STATS_HISTORY = 50;
    let currentVideo = null;
    let timeUpdateHandler = null;
    let muteEnforcer = null;
    let lastSkipBtnClick = 0;
    let chatHideStyleEl = null;

    const CHAT_SEL = 'yt-live-chat-renderer,ytd-live-chat-frame,#chat,#chat-container,#live-chat,#chat-messages,yt-live-chat-frame';
    const setChatHide = (on) => {
        const observerWasActive = chatObserver !== null;
        if (observerWasActive) chatObserver.disconnect();

        const hide = (el) => {
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('height', '0', 'important');
            el.style.setProperty('width', '0', 'important');
            el.style.setProperty('overflow', 'hidden', 'important');
            el.style.setProperty('position', 'absolute', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
        };
        const show = (el) => {
            el.style.removeProperty('visibility');
            el.style.removeProperty('height');
            el.style.removeProperty('width');
            el.style.removeProperty('overflow');
            el.style.removeProperty('position');
            el.style.removeProperty('pointer-events');
        };
        if (on) {
            if (!chatHideStyleEl) {
                chatHideStyleEl = document.createElement('style');
                chatHideStyleEl.id = 'sks-chat-hide';
                document.head.appendChild(chatHideStyleEl);
            }
            chatHideStyleEl.textContent = `${CHAT_SEL}{visibility:hidden!important;height:0!important;width:0!important;overflow:hidden!important;position:absolute!important;pointer-events:none!important}`;
            document.querySelectorAll(CHAT_SEL).forEach(hide);
        } else if (chatHideStyleEl) {
            chatHideStyleEl.remove();
            chatHideStyleEl = null;
            document.querySelectorAll(CHAT_SEL).forEach(show);
        }

        if (observerWasActive && opts.hideChat) {
            chatObserver.observe(document.body || document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        }
    };

    const trustedClick = (el) => {
        if (!el) return;
        try {
            const markId = '_sks_' + Date.now();
            el.setAttribute('data-sks-click', markId);
            const s = document.createElement('script');
            s.textContent = `(function(){var e=document.querySelector('[data-sks-click="${markId}"]');if(e){try{e.click()}catch(e){}e.removeAttribute('data-sks-click');}})();`;
            document.body.appendChild(s);
            s.remove();
        } catch(e) {
            debug('trustedClick error', e);
        }
    };

    const CLOSE_BTN_SEL = 'yt-live-chat-renderer #close-button, ytd-live-chat-frame #close-button, [aria-label="Close chat"], [aria-label="關閉聊天室"], yt-live-chat-renderer yt-icon-button#close-button, #chat:not([hidden]) yt-icon-button, yt-live-chat-header-renderer #close-button';
    const CHAT_CLOSE_SEL = '#close-button, [aria-label="Close chat"], [aria-label="關閉聊天室"], [aria-label="關閉"], yt-icon-button#close-button';
    const debugLogBtn = (label, el) => {
        if (!opts.debugMode) return;
        if (!el) { console.log(`[SkipAds:debug] ${label}: null`); return; }
        const info = {
            tag: el.tagName,
            id: el.id,
            className: el.className?.slice(0, 100),
            ariaLabel: el.getAttribute('aria-label'),
            text: el.textContent?.trim()?.slice(0, 50),
            display: getComputedStyle(el).display,
            visible: el.offsetWidth > 0 && el.offsetHeight > 0,
            rect: el.getBoundingClientRect()
        };
        console.log(`[SkipAds:debug] ${label}:`, JSON.stringify(info), el.outerHTML?.slice(0, 300));
    };
    let chatObserver = null;
    let chatTimer = null;
    let lastChatHideTime = 0;
    let chatCooldownTimer = null;
    let chatPaused = false;
    let lastChatVisible = false;
    let chatInitTime = 0;
    let chatWasVisibleAtInit = false;
    let chatProcessing = false;
    const resumeAutoHide = () => {
        if (chatCooldownTimer) { clearTimeout(chatCooldownTimer); chatCooldownTimer = null; }
        chatPaused = false;
        setChatHide(true);
        console.log('[SkipAds] Chat auto-hide resumed');
    };
    const pauseAutoHide = () => {
        const cd = opts.hideChatCooldown || 0;
        if (chatCooldownTimer) clearTimeout(chatCooldownTimer);
        setChatHide(false);
        if (cd === 0) {
            chatPaused = true;
            console.log('[SkipAds] Chat auto-hide paused indefinitely (user opened chat)');
        } else {
            chatPaused = true;
            chatCooldownTimer = setTimeout(resumeAutoHide, cd * 1000);
            console.log(`[SkipAds] Chat auto-hide paused for ${cd}s`);
        }
    };
    const hideLiveChat = () => {
        if (!opts.hideChat || chatPaused) return false;
        if (Date.now() - lastChatHideTime < 2000) return false;
        lastChatHideTime = Date.now();
        
        const chat = document.querySelector(CHAT_SEL);
        if (!chat) return false;
        
        const container = chat.querySelector(CHAT_CLOSE_SEL);
        debugLogBtn('hideLiveChat closeContainer', container);
        const candidates = new Set();
        if (container) {
            const btn = container.querySelector('button');
            if (btn) candidates.add(btn);
            const shape = container.querySelector('yt-button-shape');
            if (shape) candidates.add(shape);
            const renderer = container.querySelector('yt-button-renderer');
            if (renderer) candidates.add(renderer);
            candidates.add(container);
        }
        candidates.forEach(el => { el.focus(); trustedClick(el); });
        
        setChatHide(true);
        console.log('[SkipAds] Live chat hidden');
        return true;
    };
    const isChatVisible = (chat) => {
        if (!chat) return false;
        const s = getComputedStyle(chat);
        return s.display !== 'none' && s.visibility !== 'hidden' && chat.offsetWidth > 0 && chat.offsetHeight > 0;
    };
    let chatRetryTimer = null;
    let lastChatReLog = 0;
    const watchChat = () => {
        if (chatObserver) { chatObserver.disconnect(); chatObserver = null; }
        if (chatTimer) { clearInterval(chatTimer); chatTimer = null; }
        if (chatCooldownTimer) { clearTimeout(chatCooldownTimer); chatCooldownTimer = null; }
        if (chatRetryTimer) { clearTimeout(chatRetryTimer); chatRetryTimer = null; }
        chatPaused = false;
        lastChatVisible = false;
        chatInitTime = Date.now();
        const chatAtInit = document.querySelector(CHAT_SEL);
        const chatWasVisibleAtInit = isChatVisible(chatAtInit);
        if (!opts.hideChat) return;
        
        // 持續重試直到關閉成功
        const tryClose = () => {
            if (!opts.hideChat) return;
            const chat = document.querySelector(CHAT_SEL);
            if (!chat) {
                chatRetryTimer = setTimeout(tryClose, 500);
                return;
            }
            const closed = hideLiveChat();
            if (!closed) {
                chatRetryTimer = setTimeout(tryClose, 500);
            }
        };
        tryClose();
        
        // 立即啟動 observer/interval，但前 3 秒不判定「用戶打開」
        chatTimer = setInterval(() => {
            if (!opts.hideChat || chatPaused) return;
            setChatHide(true);
            const chat = document.querySelector(CHAT_SEL);
            const visible = isChatVisible(chat);
            if (!visible) {
                lastChatVisible = false;
                return;
            }
            const isInitialLoad = chatWasVisibleAtInit && Date.now() - chatInitTime < 3000;
            if (!lastChatVisible && !isInitialLoad) {
                console.log('[SkipAds] User opened chat, pausing auto-hide');
                pauseAutoHide();
            }
            lastChatVisible = true;
            const btn = chat?.querySelector(CHAT_CLOSE_SEL);
            if (btn) {
                if (Date.now() - lastChatReLog > 1000) {
                    debugLogBtn('watchChat(interval) found CHAT_CLOSE_SEL', btn);
                    console.log('[SkipAds] Chat re-appeared, clicking close button');
                    lastChatReLog = Date.now();
                }
                hideLiveChat();
            } else {
                debug('[SkipAds:debug] watchChat(interval): chat visible but no close btn found');
            }
        }, 1000);
        chatObserver = new MutationObserver(() => {
            if (!opts.hideChat) { chatObserver.disconnect(); return; }
            if (chatProcessing) return;
            chatProcessing = true;
            setChatHide(true);
            const chat = document.querySelector(CHAT_SEL);
            const visible = isChatVisible(chat);
            if (!visible) {
                lastChatVisible = false;
                chatProcessing = false;
                return;
            }
            const isInitialLoad = chatWasVisibleAtInit && Date.now() - chatInitTime < 3000;
            if (!lastChatVisible && !isInitialLoad) {
                console.log('[SkipAds] User opened chat, pausing auto-hide');
                pauseAutoHide();
            }
            lastChatVisible = true;
            const btn = chat?.querySelector(CHAT_CLOSE_SEL);
            if (btn) {
                if (Date.now() - lastChatReLog > 1000) {
                    debugLogBtn('watchChat(mutation) found CHAT_CLOSE_SEL', btn);
                    console.log('[SkipAds] Chat re-appeared, clicking close button');
                    lastChatReLog = Date.now();
                }
                hideLiveChat();
            } else {
                debug('[SkipAds:debug] watchChat(mutation): chat visible but no close btn found');
            }
            chatProcessing = false;
        });
        chatObserver.observe(document.body || document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
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

    const recordSkipStats = (title, video) => {
        try { if (!chrome.runtime?.id) return; } catch (e) { return; }
        let duration = 0;
        if (video && video.duration && video.duration > 0) {
            duration = Math.round(video.duration);
        } else if (adStartTime > 0) {
            duration = Math.round((Date.now() - adStartTime) / 1000);
        }
        const timeSaved = duration > 0 ? duration : 0;
        try {
            chrome.storage.local.get(['skipStats'], (data) => {
                const stats = data.skipStats || { totalSkips: 0, totalTimeSaved: 0, history: [] };
                stats.totalSkips += 1;
                stats.totalTimeSaved += timeSaved;
                const entry = {
                    title: title || 'Unknown ad',
                    duration: duration,
                    timeSaved: timeSaved,
                    timestamp: Date.now()
                };
                stats.history.unshift(entry);
                if (stats.history.length > MAX_STATS_HISTORY) {
                    stats.history = stats.history.slice(0, MAX_STATS_HISTORY);
                }
                try { chrome.storage.local.set({ skipStats: stats }); } catch (e) {}
            });
        } catch (e) {}
    };

    const isVisible = (el) => {
        if (!el) return false;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
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
            if (btn && isVisible(btn)) {
                debug('findSkipBtn: found via selector', sel, btn);
                return btn;
            }
        }
        for (const btn of document.querySelectorAll('button')) {
            const t = btn.textContent.trim().toLowerCase();
            if ((t === 'skip ad' || t === 'skip' || t === '略過廣告' || t === '略過') && isVisible(btn)) {
                debug('findSkipBtn: found via text', t, btn);
                return btn;
            }
        }
        debug('findSkipBtn: no skip button found');
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
        const collapseCooldown = opts.collapseCooldown ?? 15;
        panelCooldowns.set(panel, Date.now() + collapseCooldown * 1000);
        console.log('[SkipAds] User toggled ad panel, cooldown ' + collapseCooldown + 's');
    });

    document.addEventListener('click', (e) => {
        if (!opts.hideChat) return;
        const chatOpenBtn = e.target.closest(
            'ytSpecButtonViewModelHost button, ' +
            'ytTextCarouselItemViewModelButton button, ' +
            'ytSpecButtonViewModelHost, ' +
            'ytTextCarouselItemViewModelButton, ' +
            '[aria-label*="hat" i], ' +
            '[aria-label*="聊天" i], ' +
            '[tooltip*="hat" i], ' +
            '[tooltip*="聊天" i], ' +
            'button[aria-label*="Chat" i], ' +
            'button[aria-label*="聊天室" i]'
        );
        if (!chatOpenBtn) return;
        const chat = document.querySelector(CHAT_SEL);
        if (!chat) return;
        pauseAutoHide();
        console.log('[SkipAds] User manually opened chat via button, pausing auto-hide');
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
        return Math.min(16, 8 + (step - 3) * 8);
    };

    const checkAdAndSkip = async (v, p) => {
        const isAd = p.classList.contains('ad-showing');
        if (opts.debugMode) debug('timeupdate: isAd=', isAd, 'wasAd=', wasAd);
        if (opts.enabled === false) return;
        if (isAd) handleSurveyAd();
        if (isAd && v) {
            if (opts.hideChat && !chatPaused) hideLiveChat();
            if (!wasAd) {
                    adTitle = '';
                    adStartTime = Date.now();
                    inspectedAd = false;
                    adOriginalMuted = v.muted;
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
            if (opts.muteAd !== false) {
                debug('Muting ad video, current muted:', v.muted);
                v.muted = true;
                debug('After mute, muted:', v.muted);
                const muteAdVideos = () => {
                    const adVideos = document.querySelectorAll('.video-ads video, .ytp-ad-player-overlay video, .ytp-ad-module video, #movie_player video');
                    adVideos.forEach(adVideo => { adVideo.muted = true; });
                };
                muteAdVideos();
                if (muteEnforcer) clearInterval(muteEnforcer);
                muteEnforcer = setInterval(muteAdVideos, 500);
            }
            wasAd = true;

            const skipBtn = findSkipBtn();
            if (skipBtn) {
                debugLogBtn('findSkipBtn result', skipBtn);
                const now = Date.now();
                if (now - lastSkipBtnClick < 3000) {
                    debug('Skip button click throttled');
                } else {
                    lastSkipBtnClick = now;
                    const btn = skipBtn.querySelector('button') || skipBtn;
                    let rect = skipBtn.getBoundingClientRect();
                    let retries = 0;
                    while ((rect.width === 0 || rect.height === 0) && retries < 10) {
                        await new Promise(r => setTimeout(r, 50));
                        rect = skipBtn.getBoundingClientRect();
                        retries++;
                    }
                    if (rect.width === 0 || rect.height === 0) {
                        debug('Skip button not rendered after retries, trying trustedClick anyway');
                        btn.focus();
                        trustedClick(btn);
                    } else {
                        btn.focus();
                        trustedClick(btn);
                    }
                }
                if (v.duration > 0 && v.currentTime < v.duration - 1) {
                    v.currentTime = v.duration - 0.5;
                }
                if (Date.now() - lastSkip > 2000) {
                    lastSkip = Date.now();
                    const title = adTitle || getAdInfo();
                    console.log('[SkipAds] Skipped, title:', title);
                    showToast(title);
                    recordSkipStats(title, v);
                    if (muteEnforcer) { clearInterval(muteEnforcer); muteEnforcer = null; }
                    if (v) { v.playbackRate = 1; v.muted = adOriginalMuted; }
                    wasAd = false;
                    adTitle = '';
                    inspectedAd = false;
                    lastPrintedAd = '';
                }
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
                    debugLogBtn('hidden skip btn', hiddenBtn);
                    const now = Date.now();
                    if (now - lastSkipBtnClick < 3000) {
                        debug('Hidden skip button click throttled');
                    } else {
                        lastSkipBtnClick = now;
                        const btn = hiddenBtn.querySelector('button') || hiddenBtn;
                        trustedClick(btn);
                        const title = adTitle || getAdInfo();
                        recordSkipStats(title, v);
                        if (muteEnforcer) { clearInterval(muteEnforcer); muteEnforcer = null; }
                        if (v) { v.playbackRate = 1; v.muted = adOriginalMuted; }
                        wasAd = false;
                        adTitle = '';
                        inspectedAd = false;
                        lastPrintedAd = '';
                    }
                } else {
                    debug('No hidden skip button found either');
                }
            }
        }

        if (!isAd) {
            if (wasAd) {
                wasAd = false;
                const title = adTitle || getAdInfo();
                recordSkipStats(title, v);
                adTitle = '';
                inspectedAd = false;
                lastPrintedAd = '';
                if (muteEnforcer) { clearInterval(muteEnforcer); muteEnforcer = null; }
                if (v) { v.playbackRate = 1; v.muted = adOriginalMuted; }
            }
            updateAdOverlay('');
        }
    };

    const attachTimeUpdate = (v) => {
        if (currentVideo === v) return;
        if (currentVideo && timeUpdateHandler) {
            currentVideo.removeEventListener('timeupdate', timeUpdateHandler);
        }
        currentVideo = v;
        let lastCheck = 0;
        timeUpdateHandler = () => {
            const now = Date.now();
            if (now - lastCheck < 1000) return;
            lastCheck = now;
            const p = document.querySelector('#movie_player');
            if (p) checkAdAndSkip(v, p);
        };
        v.addEventListener('timeupdate', timeUpdateHandler);
        debug('Attached timeupdate listener to video');
    };

    const checkVideo = () => {
        const p = document.querySelector('#movie_player');
        if (!p) return;
        const v = p.querySelector('video');
        if (v && v !== currentVideo) attachTimeUpdate(v);
    };

    setInterval(() => {
        collapseAdPanels();
        checkVideo();
    }, 2000);

    checkVideo();

    let lastUserClick = 0;
    document.addEventListener('click', (e) => {
        const now = Date.now();
        if (now - lastUserClick < 500) return;
        lastUserClick = now;
        const target = e.target.closest('a[href^="/watch"], a[href^="/shorts"], ytd-thumbnail, ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer');
        if (target) {
            debug('User clicked navigation element, triggering checks');
            setTimeout(() => {
                const p = document.querySelector('#movie_player');
                const v = p?.querySelector('video');
                if (p && v) checkAdAndSkip(v, p);
                if (opts.hideChat && !chatPaused) hideLiveChat();
            }, 300);
        }
    }, true);

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
            if (muteEnforcer) { clearInterval(muteEnforcer); muteEnforcer = null; }
            const v = document.querySelector('#movie_player video');
            if (v) { v.playbackRate = 1; v.muted = adOriginalMuted; }
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
