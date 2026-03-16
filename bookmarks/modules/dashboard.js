(function initDashboardModule(global) {
  'use strict';

  function getTimeAgo(timestamp) {
    if (!timestamp) return '未知时间';
    let ts = timestamp;
    if (ts < 10000000000) ts *= 1000;

    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;

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

    if (isToday) return `今天 ${hh}:${mm}`;
    if (isYesterday) return `昨天 ${hh}:${mm}`;
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  global.JadeModules = global.JadeModules || {};
  global.JadeModules.dashboard = {
    getTimeAgo
  };
})(window);
