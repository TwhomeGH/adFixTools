const DEFAULTS = {
    speed: 2,
    muteAd: true,
    showNotification: true,
    blockHomeAds: true,
    enabled: true,
    playerSelector: '#movie_player',
    adsSelectors: ['ad-showing', 'ad-interrupting'],
    skipBtnSelector: '.ytp-ad-skip-button-modern.ytp-button,.ytp-skip-ad-button',
    notification: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="16" viewBox="0 0 18 16" fill="none">
            <path d="M12.75 14V14.75H13.5H16.5H17.25V14V2V1.25H16.5H13.5H12.75V2V8V14Z" fill="#E10600" stroke="white" stroke-width="1.5"/>
            <path d="M0.75 12.5V13.8246L1.88587 13.1431L9.38587 8.64312L10.4577 8L9.38587 7.35688L1.88587 2.85688L0.75 2.17536V3.5V12.5Z" fill="#E10600" stroke="white" stroke-width="1.5"/>
            </svg>
            <span>Ad-skipping activated</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="25" height="24" viewBox="0 0 25 24" fill="none">
            <path d="M10.05 18.0001L4.34998 12.3001L5.77498 10.8751L10.05 15.1501L19.225 5.9751L20.65 7.4001L10.05 18.0001Z" fill="white"/>
            </svg>`,
    styles: [
        {
            mask: 'youtube',
            style: 'display: flex; font-size: 16px; border-radius: 8px; justify-content: space-between; align-items: center; background-color: #AB5A5A; z-index: 2147483647;',
        },
        {
            mask: 'default',
            style: 'background-color: #77777A; display: flex; border-radius: 8px; justify-content: space-between; align-items: center; font-size: 16px; z-index: 2147483647;',
        },
    ]
};

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(DEFAULTS, (existing) => {
        const missing = {};
        for (const key in DEFAULTS) {
            if (!(key in existing)) {
                missing[key] = DEFAULTS[key];
            }
        }
        if (Object.keys(missing).length > 0) {
            chrome.storage.local.set(missing);
        }
    });
});

chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle') {
        chrome.storage.local.get('enabled', (data) => {
            chrome.storage.local.set({ enabled: !data.enabled });
        });
    }
});

chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage();
});
