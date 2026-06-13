(() => {
    'use strict';

    let opts = { speed: 2, muteAd: true, showNotification: true, blockHomeAds: true, enabled: true };
    let wasAd = false;
    let lastSkip = 0;
    let toastEl = null;
    let adTitle = '';

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

    const getAdTitle = () => {
        for (const sel of [
            '.ytp-ad-avatar-lockup-card__headline',
            '.ytp-ad-player-overlay-layout__ad-info-container',
            '.ytp-ad-title',
            '.ytp-ad-headline'
        ]) {
            const el = document.querySelector(sel);
            if (el) {
                const t = el.textContent.trim();
                if (t && t !== 'Ad') return t;
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

    const findSkipBtn = () => {
        for (const sel of [
            '.ytp-ad-skip-button', '.ytp-skip-ad-button',
            'button.ytp-ad-skip-button-modern',
            '.ytp-ad-skip-button-container button',
            '[aria-label="Skip ad"]', '[aria-label="Skip Ad"]',
            '[aria-label="\u30B9\u30AD\u30C3\u30D7"]',
            '[aria-label="\u8DF3\u8FC7\u5E7F\u544A"]'
        ]) {
            const btn = document.querySelector(sel);
            if (btn) return btn;
        }
        for (const btn of document.querySelectorAll('button')) {
            const t = btn.textContent.trim().toLowerCase();
            if (t === 'skip ad' || t === 'skip') return btn;
        }
        return null;
    };

    setInterval(() => {
        const p = document.querySelector('#movie_player');
        if (!p) return;
        const v = p.querySelector('video');
        const isAd = p.classList.contains('ad-showing');

        if (opts.enabled !== false) {
            if (isAd && v) {
                if (!wasAd) {
                    adTitle = '';
                    console.log('[SkipAds] Ad started');
                }
                if (!adTitle) {
                    adTitle = getAdTitle();
                    if (adTitle) console.log('[SkipAds] Title found:', adTitle);
                }
                v.playbackRate = opts.speed || 2;
                if (opts.muteAd !== false) v.muted = true;
                wasAd = true;
            }

            const skipBtn = findSkipBtn();
            if (skipBtn) {
                skipBtn.click();
                if (v && v.duration > 0 && v.currentTime < v.duration - 1) {
                    v.currentTime = v.duration - 0.5;
                }
                if (Date.now() - lastSkip > 2000) {
                    lastSkip = Date.now();
                    const title = adTitle || getAdTitle() || '(no title)';
                    console.log('[SkipAds] Skipped, title:', title);
                    showToast(title);
                }
                wasAd = false;
            }
        }

        if (!isAd && wasAd) {
            wasAd = false;
            adTitle = '';
            if (v) { v.playbackRate = 1; v.muted = false; }
        }
    }, 300);

    chrome.storage.local.get({
        speed: 2, muteAd: true, showNotification: true, blockHomeAds: true, enabled: true
    }, (d) => {
        opts = d;
        if (opts.blockHomeAds) {
            const w = () => { document.head ? injectAdBlockStyle() : setTimeout(w, 100); };
            w();
        }
    });

    chrome.storage.onChanged.addListener((changes) => {
        for (const k of Object.keys(changes)) {
            if (k in opts) opts[k] = changes[k].newValue;
        }
        if ('enabled' in changes && !changes.enabled.newValue) {
            wasAd = false;
            const v = document.querySelector('#movie_player video');
            if (v) { v.playbackRate = 1; v.muted = false; }
        }
        if ('blockHomeAds' in changes) {
            const el = document.getElementById('sks-adblock');
            if (changes.blockHomeAds.newValue) {
                if (document.head && !el) injectAdBlockStyle();
            } else if (el) el.remove();
        }
    });
})();