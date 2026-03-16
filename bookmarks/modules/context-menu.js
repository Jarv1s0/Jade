(function initContextMenuModule(global) {
  'use strict';

  function resolveVisibility(args) {
    const activeId = args.targetNodeId || args.targetNodeDomain;
    const isRecent = !!args.isRecent;
    const isFolder = !!args.isFolder;
    const isFrequent = !!args.isFrequent;
    const pinnedIds = args.pinnedIds || new Set();

    return {
      showPin: !isRecent,
      pinText: pinnedIds.has(activeId) ? '从我的置顶移除' : '添加到我的置顶',
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
