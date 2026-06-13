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
$('lbl_collapsePanel').textContent = i18n('opts_collapsePanel');
$('desc_collapsePanel').textContent = i18n('opts_collapsePanelDesc');
$('lbl_collapseCd').textContent = i18n('opts_collapseCd');
$('desc_collapseCd').textContent = i18n('opts_collapseCdDesc');
$('lbl_incremental').textContent = i18n('opts_incremental');
$('desc_incremental').textContent = i18n('opts_incrementalDesc');
$('lbl_enabled').textContent = i18n('opts_enabled');
$('desc_enabled').textContent = i18n('opts_enabledDesc');
$('save').textContent = i18n('opts_save');

const KEY = ['speed','muteAd','showNotification','blockHomeAds','collapsePanelAds','collapseCooldown','incrementalSpeed','enabled','playerSelector','adsSelectors','skipBtnSelector'];
const el = (id) => document.getElementById(id);

chrome.storage.local.get(KEY, (d) => {
  el('speed').value = d.speed || 2;
  el('muteAd').checked = d.muteAd !== false;
  el('showNotification').checked = d.showNotification !== false;
  el('blockHomeAds').checked = d.blockHomeAds !== false;
  el('collapsePanelAds').checked = d.collapsePanelAds !== false;
  el('collapseCooldown').value = d.collapseCooldown || 15;
  el('incrementalSpeed').checked = d.incrementalSpeed === true;
  el('enabled').checked = d.enabled !== false;
});

el('save').onclick = () => {
  chrome.storage.local.set({
    speed: parseInt(el('speed').value, 10),
    muteAd: el('muteAd').checked,
    showNotification: el('showNotification').checked,
    blockHomeAds: el('blockHomeAds').checked,
    collapsePanelAds: el('collapsePanelAds').checked,
    collapseCooldown: parseInt(el('collapseCooldown').value, 10),
    incrementalSpeed: el('incrementalSpeed').checked,
    enabled: el('enabled').checked
  }, () => {
    const s = el('status');
    s.textContent = i18n('opts_saved');
    s.className = 'ok';
    setTimeout(() => { s.className = ''; }, 1500);
  });
};