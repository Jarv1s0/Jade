(function initDashboardModule(global) {
  'use strict';

  const i18n = global.JadeI18n || null;
  const t = (key, params, fallback) => (
    i18n && typeof i18n.t === 'function'
      ? i18n.t(key, params, fallback)
      : (fallback || key)
  );

  function getTimeAgo(timestamp) {
    if (!timestamp) return t('common.unknownTime', null, 'Unknown time');
    let ts = timestamp;
    if (ts < 10000000000) ts *= 1000;

    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('common.justNow', null, 'Just now');
    if (mins < 60) return t('common.minutesAgo', { count: mins }, `${mins} min ago`);

    const date = new Date(ts);
    const today = new Date();
    const isToday = date.getDate() === today.getDate()
      && date.getMonth() === today.getMonth()
      && date.getFullYear() === today.getFullYear();

    const yesterday = new Date(today.getTime() - 86400000);
    const isYesterday = date.getDate() === yesterday.getDate()
      && date.getMonth() === yesterday.getMonth()
      && date.getFullYear() === yesterday.getFullYear();

    const hh = date.getHours().toString().padStart(2, '0');
    const mm = date.getMinutes().toString().padStart(2, '0');

    if (isToday) return t('common.todayTime', { time: `${hh}:${mm}` }, `Today ${hh}:${mm}`);
    if (isYesterday) return t('common.yesterdayTime', { time: `${hh}:${mm}` }, `Yesterday ${hh}:${mm}`);
    return t('common.monthDay', { month: date.getMonth() + 1, day: date.getDate() }, `${date.getMonth() + 1}/${date.getDate()}`);
  }

  global.JadeModules = global.JadeModules || {};
  global.JadeModules.dashboard = {
    getTimeAgo
  };
})(window);
