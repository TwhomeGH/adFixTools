const $ = (id) => document.getElementById(id);
const i18n = (key, substitutions) => chrome.i18n.getMessage(key, substitutions);

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
$('lbl_hideChat').textContent = i18n('opts_hideChat');
$('desc_hideChat').textContent = i18n('opts_hideChatDesc');
$('lbl_hideChatCd').textContent = i18n('opts_hideChatCd');
$('desc_hideChatCd').textContent = i18n('opts_hideChatCdDesc');
$('lbl_debug').textContent = i18n('opts_debug');
$('desc_debug').textContent = i18n('opts_debugDesc');
$('lbl_enabled').textContent = i18n('opts_enabled');
$('desc_enabled').textContent = i18n('opts_enabledDesc');
$('save').textContent = i18n('opts_save');

$('lbl_statsTitle').textContent = i18n('opts_statsTitle');
$('lbl_statsTotalSkips').textContent = i18n('opts_statsTotalSkips');
$('lbl_statsTimeSaved').textContent = i18n('opts_statsTimeSaved');
$('lbl_statsAvgAdDuration').textContent = i18n('opts_statsAvgAdDuration');
$('lbl_statsHistoryTitle').textContent = i18n('opts_statsHistoryTitle');
$('btn_clearStats').textContent = i18n('opts_statsClear');
$('lbl_theme').textContent = i18n('opts_theme');
$('desc_theme').textContent = i18n('opts_themeDesc');
$('collapseCooldown5').textContent = i18n('opts_seconds', '5');
$('collapseCooldown10').textContent = i18n('opts_seconds', '10');
$('collapseCooldown15').textContent = i18n('opts_seconds', '15');
$('collapseCooldown30').textContent = i18n('opts_seconds', '30');
$('collapseCooldown60').textContent = i18n('opts_seconds', '60');
$('collapseCooldown0').textContent = i18n('opts_cooldownNoPause');
$('hideChatCooldown5').textContent = i18n('opts_seconds', '5');
$('hideChatCooldown10').textContent = i18n('opts_seconds', '10');
$('hideChatCooldown30').textContent = i18n('opts_seconds', '30');
$('hideChatCooldown60').textContent = i18n('opts_minutes', '1');
$('hideChatCooldown0').textContent = i18n('opts_chatCooldownNever');
$('themeSystem').textContent = i18n('opts_themeSystem');
$('themeLight').textContent = i18n('opts_themeLight');
$('themeDark').textContent = i18n('opts_themeDark');

const KEY = ['speed','muteAd','showNotification','blockHomeAds','collapsePanelAds','collapseCooldown','incrementalSpeed','debugMode','hideChat','hideChatCooldown','enabled','theme','playerSelector','adsSelectors','skipBtnSelector'];
const el = (id) => document.getElementById(id);

chrome.storage.local.get(KEY, (d) => {
  el('speed').value = d.speed || 2;
  el('muteAd').checked = d.muteAd !== false;
  el('showNotification').checked = d.showNotification !== false;
  el('blockHomeAds').checked = d.blockHomeAds !== false;
  el('collapsePanelAds').checked = d.collapsePanelAds !== false;
  el('collapseCooldown').value = d.collapseCooldown ?? 15;
  el('incrementalSpeed').checked = d.incrementalSpeed === true;
  el('debugMode').checked = d.debugMode === true;
  el('hideChat').checked = d.hideChat === true;
  el('hideChatCooldown').value = d.hideChatCooldown || 0;
  el('enabled').checked = d.enabled !== false;
  el('theme').value = d.theme || 'system';
  applyTheme(d.theme || 'system');
});

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

el('theme').onchange = () => {
  applyTheme(el('theme').value);
};

function loadStats() {
  chrome.storage.local.get('skipStats', (data) => {
    const stats = data.skipStats || { totalSkips: 0, totalTimeSaved: 0, history: [] };
    $('stat_totalSkips').textContent = stats.totalSkips;
    $('stat_timeSaved').textContent = formatTime(stats.totalTimeSaved);
    const avg = stats.totalSkips > 0 ? Math.round(stats.totalTimeSaved / stats.totalSkips) : 0;
    $('stat_avgDuration').textContent = formatTime(avg);
    renderHistory(stats.history);
  });
}

function formatTime(seconds) {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function renderHistory(history) {
  const container = $('statsHistory');
  container.textContent = '';
  if (!history.length) {
    container.textContent = i18n('opts_statsHistoryEmpty');
    return;
  }
  history.forEach((h) => {
    const row = document.createElement('div');
    row.style.cssText = 'padding:6px 0;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center';

    const title = document.createElement('div');
    title.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    title.textContent = h.title || 'Unknown ad';

    const timeSaved = document.createElement('div');
    timeSaved.style.cssText = 'margin-left:12px;font-variant-numeric:tabular-nums';
    timeSaved.textContent = formatTime(h.timeSaved || 0);

    const timestamp = document.createElement('div');
    timestamp.style.cssText = 'margin-left:12px;color:#999;font-size:11px';
    timestamp.textContent = h.timestamp ? new Date(h.timestamp).toLocaleString() : '';

    row.append(title, timeSaved, timestamp);
    container.appendChild(row);
  });
}

$('btn_clearStats').onclick = () => {
  if (confirm(i18n('opts_statsClearConfirm'))) {
    chrome.storage.local.set({ skipStats: { totalSkips: 0, totalTimeSaved: 0, history: [] } }, loadStats);
  }
};

loadStats();

el('save').onclick = () => {
  chrome.storage.local.set({
    speed: parseInt(el('speed').value, 10),
    muteAd: el('muteAd').checked,
    showNotification: el('showNotification').checked,
    blockHomeAds: el('blockHomeAds').checked,
    collapsePanelAds: el('collapsePanelAds').checked,
    collapseCooldown: parseInt(el('collapseCooldown').value, 10),
    incrementalSpeed: el('incrementalSpeed').checked,
    debugMode: el('debugMode').checked,
    hideChat: el('hideChat').checked,
    hideChatCooldown: parseInt(el('hideChatCooldown').value, 10),
    enabled: el('enabled').checked,
    theme: el('theme').value
  }, () => {
    const s = el('status');
    s.textContent = i18n('opts_saved');
    s.className = 'ok';
    setTimeout(() => { s.className = ''; }, 1500);
  });
};
