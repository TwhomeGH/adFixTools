const $ = (id) => document.getElementById(id);
const i18n = (key) => chrome.i18n.getMessage(key);

document.title = i18n('opts_title');
$('title').textContent = i18n('opts_title');
$('lbl_speed').textContent = i18n('opts_speed');
$('desc_speed').textContent = i18n('opts_speedDesc');
$('lbl_mute').textContent = i18n('opts_mute');
$('desc_mute').textContent = i18n('opts_muteDesc');
$('lbl_toast').textContent = i18n('opts_toast');
$('desc_toast').textContent = i18n('opts_toastDesc');
$('lbl_blockAds').textContent = i18n('opts_blockAds');
$('desc_blockAds').textContent = i18n('opts_blockAdsDesc');
$('lbl_enabled').textContent = i18n('opts_enabled');
$('desc_enabled').textContent = i18n('opts_enabledDesc');
$('save').textContent = i18n('opts_save');

const KEY = ['speed','muteAd','showNotification','blockHomeAds','enabled','playerSelector','adsSelectors','skipBtnSelector'];
const el = (id) => document.getElementById(id);

chrome.storage.local.get(KEY, (d) => {
  el('speed').value = d.speed || 2;
  el('muteAd').checked = d.muteAd !== false;
  el('showNotification').checked = d.showNotification !== false;
  el('blockHomeAds').checked = d.blockHomeAds !== false;
  el('enabled').checked = d.enabled !== false;
});

el('save').onclick = () => {
  chrome.storage.local.set({
    speed: parseInt(el('speed').value, 10),
    muteAd: el('muteAd').checked,
    showNotification: el('showNotification').checked,
    blockHomeAds: el('blockHomeAds').checked,
    enabled: el('enabled').checked
  }, () => {
    const s = el('status');
    s.textContent = i18n('opts_saved');
    s.className = 'ok';
    setTimeout(() => { s.className = ''; }, 1500);
  });
};