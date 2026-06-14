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
    let currentVideo = null;
    let timeUpdateHandler = null;
    let muteEnforcer = null;

    const CLOSE_BTN_SEL = 'yt-live-chat-renderer #close-button, ytd-live-chat-frame #close-button, [aria-label="Close chat"], [aria-label="關閉聊天室"], yt-live-chat-renderer yt-icon-button#close-button, #chat:not([hidden]) yt-icon-button';
    let chatObserver = null;
    let chatTimer = null;
    let lastChatHideTime = 0;
    let chatCooldownTimer = null;
    let chatPaused = false;
    let lastChatVisible = false;
    let chatInitTime = 0;
    let chatWasVisibleAtInit = false;
    const resumeAutoHide = () => {
        if (chatCooldownTimer) { clearTimeout(chatCooldownTimer); chatCooldownTimer = null; }
        chatPaused = false;
        console.log('[SkipAds] Chat auto-hide resumed');
    };
    const pauseAutoHide = () => {
        const cd = opts.hideChatCooldown || 0;
        if (chatCooldownTimer) clearTimeout(chatCooldownTimer);
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
        if (Date.now() - lastChatHideTime < 1000) return false;
        lastChatHideTime = Date.now();
        
        const chat = document.querySelector('yt-live-chat-renderer, ytd-live-chat-frame, #chat, #chat-container, #live-chat, #chat-messages, yt-live-chat-frame');
        if (!chat) return false;
        const ytIconBtn = chat.querySelector('yt-icon-button#close-button');
        const innerBtn = chat.querySelector('yt-icon-button#close-button button, #close-button button');
        const anyBtn = chat.querySelector('[aria-label="Close chat"], [aria-label="關閉聊天室"]');
        if (ytIconBtn) {
            ytIconBtn.click();
            console.log('[SkipAds] Live chat closed via yt-icon-button');
        } else if (innerBtn) {
            innerBtn.click();
            console.log('[SkipAds] Live chat closed via inner button');
        } else if (anyBtn) {
            anyBtn.click();
            console.log('[SkipAds] Live chat closed via aria-label');
        } else {
            console.log('[SkipAds] Close button not found, will retry');
            return false;
        }
        return true;
    };
    const isChatVisible = (chat) => {
        return chat && chat.style.display !== 'none' && chat.offsetWidth > 0 && chat.offsetHeight > 0;
    };
    let chatRetryTimer = null;
    const watchChat = () => {
        if (chatObserver) { chatObserver.disconnect(); chatObserver = null; }
        if (chatTimer) { clearInterval(chatTimer); chatTimer = null; }
        if (chatCooldownTimer) { clearTimeout(chatCooldownTimer); chatCooldownTimer = null; }
        if (chatRetryTimer) { clearTimeout(chatRetryTimer); chatRetryTimer = null; }
        chatPaused = false;
        lastChatVisible = false;
        chatInitTime = Date.now();
        const chatAtInit = document.querySelector('yt-live-chat-renderer, ytd-live-chat-frame, #chat, #chat-container, #live-chat, #chat-messages, yt-live-chat-frame');
        const chatWasVisibleAtInit = isChatVisible(chatAtInit);
        if (!opts.hideChat) return;
        
        // 持續重試直到關閉成功
        const tryClose = () => {
            if (!opts.hideChat) return;
            const chat = document.querySelector('yt-live-chat-renderer, ytd-live-chat-frame, #chat, #chat-container, #live-chat, #chat-messages, yt-live-chat-frame');
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
            const chat = document.querySelector('yt-live-chat-renderer, ytd-live-chat-frame, #chat, #chat-container, #live-chat, #chat-messages, yt-live-chat-frame');
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
            if (document.querySelector(CLOSE_BTN_SEL)) {
                console.log('[SkipAds] Chat re-appeared, clicking close button');
                hideLiveChat();
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
            const isInitialLoad = chatWasVisibleAtInit && Date.now() - chatInitTime < 3000;
            if (!lastChatVisible && !isInitialLoad) {
                console.log('[SkipAds] User opened chat, pausing auto-hide');
                pauseAutoHide();
            }
            lastChatVisible = true;
            if (document.querySelector(CLOSE_BTN_SEL)) {
                console.log('[SkipAds] Chat re-appeared, clicking close button');
                hideLiveChat();
            }
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
        panelCooldowns.set(panel, Date.now() + (opts.collapseCooldown || 15) * 1000);
        console.log('[SkipAds] User toggled ad panel, cooldown ' + (opts.collapseCooldown || 15) + 's');
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
        const chat = document.querySelector('yt-live-chat-renderer, ytd-live-chat-frame, #chat, #chat-container, #live-chat, #chat-messages, yt-live-chat-frame');
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
                const adVideos = document.querySelectorAll('.video-ads video, .ytp-ad-player-overlay video, .ytp-ad-module video, #movie_player video');
                adVideos.forEach(adVideo => {
                    if (adVideo !== v) {
                        debug('Found separate ad video element, muting it too', adVideo);
                        adVideo.muted = true;
                    }
                });
                if (muteEnforcer) clearInterval(muteEnforcer);
                muteEnforcer = setInterval(() => {
                    v.muted = true;
                    adVideos.forEach(adVideo => { adVideo.muted = true; });
                }, 500);
            }
            wasAd = true;

            const skipBtn = findSkipBtn();
            if (skipBtn) {
                debug('Attempting to click skip button', skipBtn, skipBtn.className, skipBtn.id, skipBtn.offsetWidth, skipBtn.offsetHeight, skipBtn.disabled, skipBtn.style.display, skipBtn.style.visibility);
                const btn = skipBtn.querySelector('button') || skipBtn;
                let rect = skipBtn.getBoundingClientRect();
                let retries = 0;
                while ((rect.width === 0 || rect.height === 0) && retries < 10) {
                    await new Promise(r => setTimeout(r, 50));
                    rect = skipBtn.getBoundingClientRect();
                    retries++;
                }
                if (rect.width === 0 || rect.height === 0) {
                    debug('Skip button not rendered after retries, skipping click');
                } else {
                    btn.focus();
                    const cx = rect.left + rect.width / 2;
                    const cy = rect.top + rect.height / 2;
                    const baseOpts = { bubbles: true, cancelable: true, view: window, buttons: 1, clientX: cx, clientY: cy, screenX: cx + window.screenX, screenY: cy + window.screenY };
                    const pointerOpts = { ...baseOpts, pointerId: 1, pointerType: 'mouse', isPrimary: true, width: 1, height: 1, pressure: 0.5 };
                    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
                        const evt = type.startsWith('pointer') ? new PointerEvent(type, pointerOpts) : new MouseEvent(type, baseOpts);
                        btn.dispatchEvent(evt);
                    });
                    btn.click();
                    debug('Click events dispatched with coords', cx, cy);
                }
                if (v.duration > 0 && v.currentTime < v.duration - 1) {
                    v.currentTime = v.duration - 0.5;
                }
                if (Date.now() - lastSkip > 2000) {
                    lastSkip = Date.now();
                    const title = adTitle || getAdInfo();
                    console.log('[SkipAds] Skipped, title:', title);
                    showToast(title);
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
                    debug('Force clicking hidden skip button', hiddenBtn, hiddenBtn.className, hiddenBtn.id);
                    const btn = hiddenBtn.querySelector('button') || hiddenBtn;
                    const rect = hiddenBtn.getBoundingClientRect();
                    const cx = rect.left + rect.width / 2;
                    const cy = rect.top + rect.height / 2;
                    const opts_evt = { bubbles: true, cancelable: true, view: window, buttons: 1, clientX: cx, clientY: cy, screenX: cx + window.screenX, screenY: cy + window.screenY };
                    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
                        btn.dispatchEvent(new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, opts_evt));
                    });
                    debug('Force clicked hidden skip button with coords', cx, cy);
                } else {
                    debug('No hidden skip button found either');
                }
            }
        }

        if (!isAd) {
            if (wasAd) {
                wasAd = false;
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