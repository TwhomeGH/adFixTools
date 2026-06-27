(() => {
    'use strict';

    let opts = { speed: 2, muteAd: true, showNotification: true, blockHomeAds: true, collapsePanelAds: true, collapseCooldown: 15, incrementalSpeed: false, enabled: true, skipBtnClick: false, debugMode: false, hideChat: false, hideFeaturedProduct: true };
    let wasAd = false;
    let lastSkip = 0;
    let toastEl = null;
    let adOverlayEl = null;
    let adTitle = '';
    let adUrl = '';
    let adStartTime = 0;
    let inspectedAd = false;
    let lastPrintedAd = '';
    let adOriginalMuted = false;
    let adOriginalMutedSaved = false;
    let lastAdSpeedChange = 0;
    let currentAdSpeed = 1;
    const panelCooldowns = new Map();
    const MAX_STATS_HISTORY = 50;
    let currentVideo = null;
    let timeUpdateHandler = null;
    let muteEnforcer = null;
    let lastSkipBtnClick = 0;
    const CHAT_CONTAINER_SEL = '#chat-container, #panels-full-bleed-container';

    const CHAT_HIDE = ['visibility', 'height', 'min-height', 'max-height', 'overflow', 'padding', 'margin', 'border', 'flex'];
    const forceLayout = () => {
        window.dispatchEvent(new Event('resize'));
        void document.documentElement.offsetHeight;
    };
    const setChatHide = (on) => {
        if (location.hostname === 'studio.youtube.com') return;
        const all = document.querySelectorAll(CHAT_CONTAINER_SEL);
        if (!all.length) return;
        for (const el of all) {
            if (on) {
                el.style.setProperty('visibility', 'hidden', 'important');
                el.style.setProperty('height', '0', 'important');
                el.style.setProperty('min-height', '0', 'important');
                el.style.setProperty('max-height', '0', 'important');
                el.style.setProperty('overflow', 'hidden', 'important');
                el.style.setProperty('padding', '0', 'important');
                el.style.setProperty('margin', '0', 'important');
                el.style.setProperty('border', '0', 'important');
                el.style.setProperty('flex', '0 0 0', 'important');
                attachChatStyleObserver(el);
                showPanelBtn();
            } else {
                if (chatStyleObserver) { chatStyleObserver.disconnect(); chatStyleObserver = null; }
                for (const p of CHAT_HIDE) el.style.removeProperty(p);
            }
        }
        if (on) { if (opts.debugMode) debug('Chat hidden'); forceLayout(); }
    };

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

    let chatTimer = null;
    let chatCooldownTimer = null;
    let chatPaused = false;
    let panelReplaceBtn = null;
    let chatStyleObserver = null;
    let chatDomObserver = null;
    const setupChatObservers = () => {
        teardownChatObservers();
        chatDomObserver = new MutationObserver((mutations) => {
            if (!opts.hideChat || chatPaused) return;
            for (const m of mutations) {
                if (m.type !== 'childList') continue;
                for (const n of m.addedNodes) {
                    if (n.nodeType === 1) {
                        if (n.matches && n.matches(CHAT_CONTAINER_SEL)) { setChatHide(true); return; }
                        const inner = n.querySelector && n.querySelector(CHAT_CONTAINER_SEL);
                        if (inner) { setChatHide(true); return; }
                    }
                }
            }
        });
        chatDomObserver.observe(document.documentElement, { childList: true, subtree: true });
    };
    const attachChatStyleObserver = (el) => {
        if (!el) return;
        if (chatStyleObserver) chatStyleObserver.disconnect();
        chatStyleObserver = new MutationObserver(() => {
            if (!opts.hideChat || chatPaused) return;
            if (el.style.visibility !== 'hidden' || el.style.height !== '0px') setChatHide(true);
        });
        chatStyleObserver.observe(el, { attributes: true, attributeFilter: ['style'] });
    };
    const teardownChatObservers = () => {
        if (chatStyleObserver) { chatStyleObserver.disconnect(); chatStyleObserver = null; }
        if (chatDomObserver) { chatDomObserver.disconnect(); chatDomObserver = null; }
    };
    const resumeAutoHide = () => {
        if (chatCooldownTimer) { clearTimeout(chatCooldownTimer); chatCooldownTimer = null; }
        chatPaused = false;
        setChatHide(true);
        showPanelBtn();
        console.log('[SkipAds] Chat auto-hide resumed');
    };
    const pauseAutoHide = () => {
        const cd = opts.hideChatCooldown || 0;
        if (chatCooldownTimer) clearTimeout(chatCooldownTimer);
        chatPaused = true;
        setChatHide(false);
        removePanelBtn();
        if (cd !== 0) {
            chatCooldownTimer = setTimeout(resumeAutoHide, cd * 1000);
            console.log(`[SkipAds] Chat auto-hide paused for ${cd}s`);
        } else {
            console.log('[SkipAds] Chat auto-hide paused indefinitely');
        }
    };
    const showPanelBtn = () => {
        const ytText = document.querySelector('yt-text-carousel-item-view-model');
        if (!ytText) return;
        const origBtn = ytText.querySelector('button-view-model.ytSpecButtonViewModelHost');
        if (origBtn) origBtn.style.setProperty('display', 'none', 'important');
        if (panelReplaceBtn && panelReplaceBtn.isConnected) return;
        panelReplaceBtn = document.createElement('button');
        panelReplaceBtn.id = 'sks-panel-btn';
        panelReplaceBtn.textContent = '開啟面板';
        panelReplaceBtn.style.cssText = [
            'cursor:pointer', 'background:#ff4444', 'color:#fff',
            'border:none', 'border-radius:20px', 'padding:6px 16px',
            'font-size:13px', 'white-space:nowrap', 'line-height:normal',
            'margin-left:8px', 'flex-shrink:0'
        ].join(';');
        panelReplaceBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            pauseAutoHide();
        });
        ytText.appendChild(panelReplaceBtn);
    };
    const removePanelBtn = () => {
        if (panelReplaceBtn && panelReplaceBtn.isConnected) panelReplaceBtn.remove();
        panelReplaceBtn = null;
        const origBtn = document.querySelector('yt-text-carousel-item-view-model button-view-model.ytSpecButtonViewModelHost');
        if (origBtn) origBtn.style.removeProperty('display');
    };
    const hideLiveChat = () => {
        if (!opts.hideChat || chatPaused) return false;
        const el = document.querySelector(CHAT_CONTAINER_SEL);
        if (!el) return false;
        setChatHide(true);
        showPanelBtn();
        console.log('[SkipAds] Live chat hidden');
        return true;
    };
    const watchChat = () => {
        chatPaused = false;
        if (chatCooldownTimer) { clearTimeout(chatCooldownTimer); chatCooldownTimer = null; }

        if (!opts.hideChat) {
            teardownChatObservers();
            if (chatTimer) { clearInterval(chatTimer); chatTimer = null; }
            setChatHide(false);
            removePanelBtn();
            return;
        }

        if (!chatDomObserver) {
            setupChatObservers();
            chatTimer = setInterval(() => {
                if (!opts.hideChat || chatPaused) return;
                const els = document.querySelectorAll(CHAT_CONTAINER_SEL);
                if (!els.length) return;
                for (const el of els) {
                    if (el.style.visibility !== 'hidden' || el.style.height !== '0px') {
                        setChatHide(true);
                        return;
                    }
                }
            }, 2000);
        }

        const doHide = () => {
            if (!opts.hideChat || chatPaused) return;
            if (!document.querySelector(CHAT_CONTAINER_SEL)) return false;
            setChatHide(true);
            showPanelBtn();
            return true;
        };

        if (!doHide()) {
            setTimeout(() => {
                if (!doHide()) setTimeout(doHide, 500);
            }, 500);
        }
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

    const getAdUrl = () => {
        const containers = '.ytp-ad-player-overlay-layout, .ytp-video-interstitial-buttoned-centered-layout, .ytp-ad-player-overlay, .video-ads';
        const link = document.querySelector(`${containers} a[href]`);
        if (link) {
            const href = link.getAttribute('href');
            if (href && (href.startsWith('http') || href.startsWith('//'))) return href;
            if (href && href.startsWith('/')) return 'https://www.youtube.com' + href;
        }
        const root = document.querySelector(containers);
        if (root) {
            for (const el of root.querySelectorAll('*')) {
                for (const attr of el.attributes) {
                    const v = attr.value;
                    if (v && /^https?:\/\/(?:www\.)?youtube\.com\//.test(v)) return v;
                }
            }
        }
        for (const sel of ['.ytp-ad-destination', '.ytp-ad-avatar-lockup-card__description', '.ytp-ad-details-line__text--style-responsive']) {
            const el = document.querySelector(sel);
            if (el) {
                const text = el.textContent.trim();
                if (text) {
                    if (text.startsWith('http')) return text;
                    let fixed = text.replace(/^https?:\/\//, '');
                    if (/^youtube\.com\//i.test(fixed)) fixed = 'www.' + fixed;
                    return `https://${encodeURI(fixed)}`;
                }
            }
        }
        return '';
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

    const recordSkipStats = (title, video, url) => {
        try { if (!chrome.runtime?.id) return; } catch (e) { return; }
        let duration = 0;
        if (adStartTime > 0) {
            duration = Math.round((Date.now() - adStartTime) / 1000);
        } else if (video && video.duration && video.duration > 0) {
            duration = Math.round(video.duration);
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
                    timestamp: Date.now(),
                    url: url || ''
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
                    adUrl = '';
                    adStartTime = Date.now();
                    inspectedAd = false;
                    if (!adOriginalMutedSaved) {
                        adOriginalMuted = v.muted;
                        adOriginalMutedSaved = true;
                    }
                    updateAdOverlay('\u23ED Ad...');
                }
            if (!adTitle) {
                adTitle = getAdInfo();
                adUrl = getAdUrl();
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
                        const player = document.querySelector('#movie_player');
                        if (player) {
                            debug('player class:', player.className);
                            debug('player style:', player.getAttribute('style'));
                            const pRect = player.getBoundingClientRect();
                            debug('player rect:', JSON.stringify({w:pRect.width,h:pRect.height,l:pRect.left,t:pRect.top}));
                            if (v) {
                                const vRect = v.getBoundingClientRect();
                                debug('video rect:', JSON.stringify({w:vRect.width,h:vRect.height,l:vRect.left,t:vRect.top}));
                            }
                        }
                        const watchFlexy = document.querySelector('ytd-watch-flexy');
                        if (watchFlexy) {
                            debug('watch-flexy class:', watchFlexy.className);
                            debug('watch-flexy style:', watchFlexy.getAttribute('style'));
                        }
                        console.log('[SkipAds] Ad info:', adTitle);
                    }
                }
            }
            const now = Date.now();
            const maxSpeed = opts.speed || 2;
            if (now - lastAdSpeedChange > 2000 + Math.random() * 4000) {
                lastAdSpeedChange = now;
                if (opts.incrementalSpeed) {
                    const elapsed = (now - adStartTime) / 1000;
                    const base = calcIncrementalSpeed(elapsed);
                    const r = Math.random();
                    if (r < 0.2) {
                        currentAdSpeed = 1;
                    } else if (r < 0.35) {
                        currentAdSpeed = Math.max(1, base * (0.5 + Math.random() * 0.5));
                    } else {
                        currentAdSpeed = base * (0.8 + Math.random() * 0.4);
                    }
                    currentAdSpeed = Math.min(16, Math.max(1, Math.round(currentAdSpeed * 2) / 2));
                } else {
                    const speeds = [1, 1.5, 2, 3, 4].filter(s => s <= maxSpeed);
                    const r = Math.random();
                    if (r < 0.15) {
                        currentAdSpeed = 1;
                    } else if (r < 0.4) {
                        currentAdSpeed = speeds[Math.floor(Math.random() * speeds.length)] || 1;
                    } else {
                        currentAdSpeed = maxSpeed * (0.6 + Math.random() * 0.4);
                        currentAdSpeed = Math.max(1, Math.min(maxSpeed, Math.round(currentAdSpeed * 2) / 2));
                    }
                }
                if (opts.debugMode) debug('Ad speed changed to', currentAdSpeed);
            }
            v.playbackRate = currentAdSpeed;
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

            if (opts.skipBtnClick !== false) {
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
                        recordSkipStats(title, v, adUrl);
                        if (muteEnforcer) { clearInterval(muteEnforcer); muteEnforcer = null; }
                        if (v) { v.playbackRate = 1; v.muted = adOriginalMuted; }
                        wasAd = false;
                        adTitle = '';
                        adUrl = '';
                        inspectedAd = false;
                        lastPrintedAd = '';
                        adOriginalMutedSaved = false;
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
                            recordSkipStats(title, v, adUrl);
                            if (muteEnforcer) { clearInterval(muteEnforcer); muteEnforcer = null; }
                            if (v) { v.playbackRate = 1; v.muted = adOriginalMuted; }
                            wasAd = false;
                            adTitle = '';
                            adUrl = '';
                            inspectedAd = false;
                            lastPrintedAd = '';
                            adOriginalMutedSaved = false;
                        }
                    } else {
                        debug('No hidden skip button found either');
                    }
                }
            }
        }

        if (!isAd) {
            if (wasAd) {
                wasAd = false;
                const adElapsed = Date.now() - adStartTime;
                if (adElapsed >= 1000) {
                    const title = adTitle || getAdInfo();
                    recordSkipStats(title, v, adUrl);
                }
                adTitle = '';
                adUrl = '';
                inspectedAd = false;
                lastPrintedAd = '';
                adOriginalMutedSaved = false;
                currentAdSpeed = 1;
                lastAdSpeedChange = 0;
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

    let adClassObserver = null;

    const setupAdClassObserver = (p) => {
        if (adClassObserver) adClassObserver.disconnect();
        adClassObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === 'attributes' && m.attributeName === 'class' && m.target.classList.contains('ad-showing') && opts.muteAd !== false) {
                    const v = m.target.querySelector('video');
                    if (v && !v.muted) {
                        if (!adOriginalMutedSaved) {
                            adOriginalMuted = v.muted;
                            adOriginalMutedSaved = true;
                        }
                        v.muted = true;
                        debug('Ad class observer: instant mute');
                        if (opts.debugMode) {
                            const pRect = m.target.getBoundingClientRect();
                            const vRect = v.getBoundingClientRect();
                            debug('observer player rect:', JSON.stringify({w:pRect.width,h:pRect.height,l:pRect.left,t:pRect.top}));
                            debug('observer video rect:', JSON.stringify({w:vRect.width,h:vRect.height,l:vRect.left,t:vRect.top}));
                            debug('player class (observer):', m.target.className);
                        }
                    }
                }
            }
        });
        adClassObserver.observe(p, { attributes: true, attributeFilter: ['class'] });
    };

    const checkVideo = () => {
        const p = document.querySelector('#movie_player');
        if (!p) return;
        if (!adClassObserver) setupAdClassObserver(p);
        const v = p.querySelector('video');
        if (v && v !== currentVideo) attachTimeUpdate(v);
    };

    const MAX_FP_HISTORY = 50;
    const getFeaturedProductInfo = (el) => {
        const titleEl = el.querySelector('.ytp-featured-product-title');
        const priceEl = el.querySelector('[class*="price"]');
        const vendorEl = el.querySelector('[class*="vendor"]');
        const img = el.querySelector('img');
        const parts = [];
        for (const node of el.querySelectorAll(':scope > *')) {
            const t = node.textContent.trim();
            if (t) parts.push(t);
        }
        if (!parts.length) {
            const t = el.textContent.trim();
            if (t) parts.push(t);
        }
        let title = titleEl?.textContent?.trim() || parts[0] || '';
        let price = priceEl?.textContent?.trim() || '';
        if (!price) {
            for (const p of parts) {
                const m = p.match(/[$¥£€][\s]*[\d,]+(?:\.\d{2})?/);
                if (m) { price = m[0]; break; }
            }
        }
        if (!price) {
            const lbl = el.querySelector('[aria-label*="$"], [aria-label*="NT$"], [aria-label*="price"], [aria-label*="價格"]');
            if (lbl) {
                const m = lbl.getAttribute('aria-label').match(/[$¥£€][\s]*[\d,]+(?:\.\d{2})?/);
                if (m) price = m[0];
            }
        }
        const vendor = vendorEl?.textContent?.trim() || '';
        const full = title + (vendor ? ` (${vendor})` : '');
        return {
            title: full,
            baseTitle: title,
            price: price || '',
            imgSrc: img?.src || '',
            url: ''
        };
    };
    const recordFeaturedProduct = (info) => {
        try { if (!chrome.runtime?.id) return; } catch (e) { return; }
        const { title, baseTitle, price, url, imgSrc } = info;
        if (!title && !price) return;
        try {
            chrome.storage.local.get(['featuredProductStats'], (data) => {
                const stats = data.featuredProductStats || { totalSeen: 0, history: [] };
                if (stats.history.length > 0) {
                    const last = stats.history[0];
                    const lastBase = last.baseTitle || last.title.replace(/\s*\([^)]*\)\s*$/, '');
                    if (lastBase === (baseTitle || title) && last.price === price) return;
                }
                stats.totalSeen += 1;
                const entry = {
                    title: title || '(unknown product)',
                    baseTitle: baseTitle || title || '',
                    price: price || '',
                    url: url || '',
                    imgSrc: imgSrc || '',
                    timestamp: Date.now()
                };
                stats.history.unshift(entry);
                if (stats.history.length > MAX_FP_HISTORY) {
                    stats.history = stats.history.slice(0, MAX_FP_HISTORY);
                }
                try { chrome.storage.local.set({ featuredProductStats: stats }); } catch (e) {}
            });
        } catch (e) {}
    };
    const MAX_HOME_AD_HISTORY = 50;
    const HOME_AD_SELS = [
        'ytd-display-ad-renderer', 'ytd-statement-banner-renderer', 'ytd-ad-slot-renderer',
        'ytd-promoted-sparkles-web-renderer', 'ytd-compact-promoted-video-renderer',
        'ytd-in-feed-ad-layout-renderer', '#masthead-ad', 'ytd-merch-shelf-renderer',
        'ytd-promoted-video-renderer', 'ytd-video-masthead-ad-v3-renderer'
    ];
    const recordedHomeAds = new Set();
    const getHomeAdInfo = (el) => {
        const seen = new Set();
        const textParts = [];
        const linkEl = el.querySelector('a[href*="googleadservices"]');
        const url = linkEl ? linkEl.href : '';
        const metadata = el.querySelector('feed-ad-metadata-view-model');
        if (metadata) {
            const headlineLinks = metadata.querySelectorAll('.ytAttributedStringLink');
            for (const a of headlineLinks) {
                const t = a.textContent.trim();
                if (t && !seen.has(t)) { seen.add(t); textParts.push(t); }
            }
            const detailLine = metadata.querySelector('ad-details-line-view-model');
            if (detailLine) {
                const t = detailLine.textContent.trim();
                if (t) textParts.push(`[${t}]`);
            }
        }
        if (!textParts.length) {
            const allText = el.textContent.replace(/\s+/g, ' ').trim().slice(0, 200);
            if (allText) textParts.push(allText);
        }
        return { text: textParts.join(' · ') || '(empty ad)', url };
    };
    const recordHomeAd = (info) => {
        try { if (!chrome.runtime?.id) return; } catch (e) { return; }
        const { text, url } = info;
        if (!text) return;
        const key = text + url;
        if (recordedHomeAds.has(key)) return;
        recordedHomeAds.add(key);
        try {
            chrome.storage.local.get(['homeAdStats'], (data) => {
                const stats = data.homeAdStats || { totalSeen: 0, history: [] };
                stats.totalSeen += 1;
                const entry = { text, url, timestamp: Date.now() };
                stats.history.unshift(entry);
                if (stats.history.length > MAX_HOME_AD_HISTORY) {
                    stats.history = stats.history.slice(0, MAX_HOME_AD_HISTORY);
                }
                try { chrome.storage.local.set({ homeAdStats: stats }); } catch (e) {}
            });
        } catch (e) {}
    };
    const scanHomeAds = () => {
        if (!opts.blockHomeAds) return;
        const joined = HOME_AD_SELS.join(',');
        document.querySelectorAll(joined).forEach(el => {
            if (el.offsetParent !== null) return;
            const info = getHomeAdInfo(el);
            recordHomeAd(info);
        });
    };

    let fpStyleInjected = false;
    const collapseFeaturedProduct = () => {
        if (!opts.hideFeaturedProduct) return;
        if (!fpStyleInjected) {
            const s = document.createElement('style');
            s.id = 'sks-hide-fp';
            s.textContent = '.ytp-featured-product{display:none!important}';
            (document.head || document.documentElement).appendChild(s);
            fpStyleInjected = true;
        }
        document.querySelectorAll('.ytp-suggested-action-badge.ytp-featured-product').forEach(el => {
            if (el.style.display !== 'none') {
                if (opts.debugMode) console.log('[SkipAds:debug] featured product badge:', el.outerHTML.slice(0, 2000));
                const info = getFeaturedProductInfo(el);
                if (opts.debugMode) console.log('[SkipAds:debug] extracted product info:', info);
                recordFeaturedProduct(info);
                el.style.setProperty('display', 'none', 'important');
            }
        });
    };

    setInterval(() => {
        collapseAdPanels();
        collapseFeaturedProduct();
        scanHomeAds();
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
                if (opts.hideChat) { chatPaused = false; hideLiveChat(); }
            }, 300);
        }
    }, true);

    chrome.storage.local.get({
        speed: 2, muteAd: true, showNotification: true, blockHomeAds: true, collapsePanelAds: true, collapseCooldown: 15, incrementalSpeed: false, enabled: true, skipBtnClick: false, debugMode: false, hideChat: false, hideChatCooldown: 0, hideFeaturedProduct: true
    }, (d) => {
        opts = d;
        if (opts.hideFeaturedProduct) {
            collapseFeaturedProduct();
        }
        if (opts.blockHomeAds) {
            const w = () => {
                if (document.head) {
                    injectAdBlockStyle();
                    setTimeout(scanHomeAds, 500);
                } else {
                    setTimeout(w, 100);
                }
            };
            w();
        }
        watchChat();
    });

    chrome.storage.onChanged.addListener((changes) => {
        for (const k of Object.keys(changes)) {
            if (k in opts) opts[k] = changes[k].newValue;
        }
        if ('hideChat' in changes || 'hideChatCooldown' in changes) watchChat();
        if ('hideFeaturedProduct' in changes && !changes.hideFeaturedProduct.newValue) {
            const fpStyle = document.getElementById('sks-hide-fp');
            if (fpStyle) fpStyle.remove();
            document.querySelectorAll('.ytp-suggested-action-badge').forEach(el => el.style.removeProperty('display'));
            fpStyleInjected = false;
        }
        if ('enabled' in changes && !changes.enabled.newValue) {
            wasAd = false;
            adOriginalMutedSaved = false;
            currentAdSpeed = 1;
            lastAdSpeedChange = 0;
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
