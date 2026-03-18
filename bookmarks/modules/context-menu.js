(function initContextMenuModule(global) {
  'use strict';

  const i18n = global.JadeI18n || null;
  const t = (key, params, fallback) => (
    i18n && typeof i18n.t === 'function'
      ? i18n.t(key, params, fallback)
      : (fallback || key)
  );

  function resolveVisibility(args) {
    const activeId = args.targetNodePinKey || args.targetNodeId || args.targetNodeDomain;
    const isRecent = !!args.isRecent;
    const isFolder = !!args.isFolder;
    const isFrequent = !!args.isFrequent;
    const pinnedIds = args.pinnedIds || new Set();

    return {
      showPin: !isRecent,
      pinText: pinnedIds.has(activeId)
        ? t('popup.contextMenu.removeFromPinned', null, 'Remove from Pinned')
        : t('popup.contextMenu.addToPinned', null, 'Add to Pinned'),
      showSortName: isFolder && !isRecent,
      showSortTime: isFolder && !isRecent,
      showEdit: (args.targetNodeId || isFrequent) && !isRecent,
      showDelete: !!(args.targetNodeId && !isRecent),
      showAddToGroup: isRecent,
      showRemoveRecent: isRecent,
      showDivider: !isRecent
    };
  }

  function resolvePosition(args) {
    const menuWidth = 140;
    const menuHeight = args.isFolder ? 160 : (args.isFrequent ? 120 : 100);
    let x = args.clientX;
    let y = args.clientY;
    if (x + menuWidth > args.bodyWidth) x -= menuWidth;
    if (y + menuHeight > args.bodyHeight) y -= menuHeight;
    return { x, y };
  }

  global.JadeModules = global.JadeModules || {};
  global.JadeModules.contextMenu = {
    resolveVisibility,
    resolvePosition
  };
})(window);
