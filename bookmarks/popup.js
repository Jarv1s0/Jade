document.addEventListener('DOMContentLoaded', function () {
  const i18n = window.JadeI18n || null;
  const t = (key, params, fallback) => (
    i18n && typeof i18n.t === 'function'
      ? i18n.t(key, params, fallback)
      : (fallback || key)
  );

  if (i18n && typeof i18n.apply === 'function') {
    i18n.apply(document);
    i18n.setDocumentTitle('popup.pageTitle', null, 'Jade Bookmark Launcher');
  }

  // 元素引用
  const searchInput = document.getElementById('searchInput');
  const shortcutHint = document.getElementById('shortcutHint');
  const breadcrumb = document.getElementById('breadcrumb');
  const frequentSection = document.getElementById('frequentSection');
  const frequentGrid = document.getElementById('frequentGrid');
  const recentSection = document.getElementById('recentSection');
  const recentListView = document.getElementById('recentListView');
  const categorySection = document.getElementById('categorySection');
  const categoryGrid = document.getElementById('categoryGrid');
  const bookmarkList = document.getElementById('bookmarkList');
  const mainPanel = document.getElementById('mainPanel');

  // 底部按钮
  const btnManageBookmarksBtn = document.getElementById('btnManageBookmarksBtn');
  const btnHistoryBtn = document.getElementById('btnHistoryBtn');
  const openToolboxBtn = document.getElementById('btnToolsMain');

  // 工具箱模态框
  const toolsModal = document.getElementById('toolsModal');
  const toolsCloseBtn = document.getElementById('toolsCloseBtn');
  const toolsBackBtn = document.getElementById('toolsBackBtn');
  const toolsTitle = document.getElementById('toolsTitle');
  const toolsMenuView = document.getElementById('toolsMenuView');
  const toolsDetailView = document.getElementById('toolsDetailView');
  const toolsResultList = document.getElementById('toolsResultList');
  const btnImportBookmarksNew = document.getElementById('btnImportBookmarksNew');
  const btnExportBookmarksNew = document.getElementById('btnExportBookmarksNew');
  const btnFindDuplicates = document.getElementById('btnFindDuplicates');
  const btnFindBrokenLinks = document.getElementById('btnFindBrokenLinks');
  const btnCleanEmptyFolders = document.getElementById('btnCleanEmptyFolders');
  const btnBookmarkStats = document.getElementById('btnBookmarkStats');
  const btnBatchReplaceUrl = document.getElementById('btnBatchReplaceUrl');

  // 右键菜单与编辑模态框
  const contextMenu = document.getElementById('contextMenu');
  const menuPin = document.getElementById('menuPin');
  const menuSortName = document.getElementById('menuSortName');
  const menuSortTime = document.getElementById('menuSortTime');
  const menuEdit = document.getElementById('menuEdit');
  const menuDelete = document.getElementById('menuDelete');
  const menuAddToGroup = document.getElementById('menuAddToGroup');
  const menuRemoveRecent = document.getElementById('menuRemoveRecent');
  const menuDivider1 = document.getElementById('menuDivider1');
  const editModal = document.getElementById('editModal');
  const editModalTitle = document.getElementById('editModalTitle');
  const editTitleInput = document.getElementById('editTitleInput');
  const editUrlGroup = document.getElementById('editUrlGroup');
  const editUrlInput = document.getElementById('editUrlInput');
  const editSaveBtn = document.getElementById('editSaveBtn');
  const editCancelBtn = document.getElementById('editCancelBtn');
  const confirmModal = document.getElementById('confirmModal');
  const confirmModalContent = confirmModal ? confirmModal.querySelector('.confirm-modal-content') : null;
  const confirmModalTitle = document.getElementById('confirmModalTitle');
  const confirmModalMessage = document.getElementById('confirmModalMessage');
  const confirmModalHint = document.getElementById('confirmModalHint');
  const confirmOkBtn = document.getElementById('confirmOkBtn');
  const confirmCancelBtn = document.getElementById('confirmCancelBtn');

  const importFileInput = document.getElementById('importFileInput');

  // 拖拽排序 (书签列表)
  let draggedItem = null;
  let draggedItemId = null;

  // 状态变量
  let currentFolderId = '1'; // Default: Bookmarks Bar
  let navigationStack = [];
  let isSearching = false;
  let targetNodeId = null;
  let targetNodeIsFolder = false;
  let targetNodeDomain = null; // New for history items
  let targetNodePinKey = null;
  let targetFrequentKey = null;
  let targetFrequentUrl = null; // 常用卡片当前 URL
  let pinnedIds = new Set();
  let frequentOrder = []; // 用户自定义的常用访问排序
  let frequentCustomTitles = {}; // 用户自定义的常用卡片显示名称
  let frequentCustomUrls = {}; // 用户自定义的常用卡片 URL
  let currentFrequentItems = []; // 当前显示的 frequent 列表引用
  let hiddenRecentUrls = []; // 被用户移除的最近访问URL
  let brokenLinkScanSession = null; // 死链扫描任务会话（用于取消）
  let confirmResolver = null; // 自定义确认弹窗 Promise 解析器
  let confirmKeydownHandler = null; // 自定义确认弹窗键盘事件
  const modules = window.JadeModules || {};
  const bookmarkService = modules.bookmarkService || null;
  const dashboardModule = modules.dashboard || null;
  const contextMenuModule = modules.contextMenu || null;
  const toolsModule = modules.tools || null;
  const toolboxViewModule = modules.toolboxView || null;
  const urlReplaceToolModule = modules.urlReplaceTool || null;
  const bookmarkTreeCacheManager = bookmarkService && bookmarkService.createTreeCache
    ? bookmarkService.createTreeCache(chrome)
    : null;
  const bookmarkTreeCacheFallback = {
    data: null,
    inFlight: null
  };
  const PINNED_PREF_KEYS = ['pinned_bookmarks', 'frequent_order'];
  const CUSTOM_PREF_KEYS = ['frequent_custom_titles', 'frequent_custom_urls'];
  const preferenceStorageArea = chrome.storage.sync || chrome.storage.local;
  const DEAD_LINK_CACHE_KEY = 'dead_link_probe_cache_v1';
  const DEAD_LINK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const DEAD_LINK_CACHE_MAX_ENTRIES = 4000;
  const extensionNewTabUrl = chrome.runtime.getURL('newtab/index.html');
  const reusableNewTabUrls = [
    extensionNewTabUrl,
    'chrome://newtab/',
    'chrome://newtab',
    'chrome-search://local-ntp/local-ntp.html',
    'edge://newtab/',
    'edge://newtab',
    'about:newtab'
  ];
  let deadLinkProbeCache = {};
  let deadLinkCachePersistTimer = null;

  function getCurrentFolderPathTitles() {
    return navigationStack.slice(1).map(item => item.title || '').filter(Boolean);
  }

  function normalizeUrlForPin(url) {
    if (typeof url !== 'string') return '';
    const raw = url.trim();
    if (!raw) return '';

    try {
      const parsed = new URL(raw);
      parsed.hash = '';
      if ((parsed.protocol === 'http:' && parsed.port === '80')
        || (parsed.protocol === 'https:' && parsed.port === '443')) {
        parsed.port = '';
      }
      return parsed.toString();
    } catch (_) {
      return raw;
    }
  }

  function normalizeFolderSegment(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  function getBookmarkPinKey(url) {
    const normalized = normalizeUrlForPin(url);
    return normalized ? `url:${normalized}` : '';
  }

  function getFolderPinKey(pathTitles) {
    const normalized = (pathTitles || [])
      .map(normalizeFolderSegment)
      .filter(Boolean);
    return normalized.length > 0 ? `folder:${normalized.join('/')}` : '';
  }

  function getNodePinKey(node, parentPathTitles = []) {
    if (!node || node.id === '0') return '';
    if (node.url) return getBookmarkPinKey(node.url);
    return getFolderPinKey(parentPathTitles.concat(node.title || ''));
  }

  function getItemPinKey(item, parentPathTitles = []) {
    if (!item || typeof item !== 'object') return '';
    if (item.pinKey) return item.pinKey;
    if (item.url) return getBookmarkPinKey(item.url);
    return getFolderPinKey(parentPathTitles.concat(item.title || ''));
  }

  function isStablePinKey(value) {
    return typeof value === 'string'
      && (value.startsWith('url:') || value.startsWith('folder:'));
  }

  function buildPinMaps(tree) {
    const idToPinKey = new Map();
    const nodeByPinKey = new Map();

    function walk(nodes, parentPathTitles = []) {
      (nodes || []).forEach((node) => {
        if (!node) return;

        const pinKey = getNodePinKey(node, parentPathTitles);
        if (node.id !== '0' && pinKey) {
          idToPinKey.set(node.id, pinKey);
          if (!nodeByPinKey.has(pinKey)) {
            nodeByPinKey.set(pinKey, node);
          }
        }

        if (Array.isArray(node.children) && node.children.length > 0) {
          const nextPath = node.id === '0'
            ? parentPathTitles
            : parentPathTitles.concat(node.title || '');
          walk(node.children, nextPath);
        }
      });
    }

    walk(Array.isArray(tree) ? tree : []);
    return { idToPinKey, nodeByPinKey };
  }

  function migrateStoredPinList(list, idToPinKey) {
    const migrated = [];
    const seen = new Set();
    let changed = false;

    (Array.isArray(list) ? list : []).forEach((entry) => {
      let stableKey = '';
      if (isStablePinKey(entry)) {
        stableKey = entry;
      } else if (idToPinKey.has(String(entry))) {
        stableKey = idToPinKey.get(String(entry));
        changed = true;
      } else {
        changed = true;
      }

      if (!stableKey || seen.has(stableKey)) return;
      seen.add(stableKey);
      migrated.push(stableKey);
    });

    return { value: migrated, changed };
  }

  function loadPinnedPreferences(callback) {
    if (preferenceStorageArea === chrome.storage.local) {
      chrome.storage.local.get(PINNED_PREF_KEYS, (res) => callback(res || {}, false));
      return;
    }

    preferenceStorageArea.get(PINNED_PREF_KEYS, (syncRes) => {
      const hasSyncData = PINNED_PREF_KEYS.some((key) => syncRes && syncRes[key] !== undefined);
      if (hasSyncData) {
        callback(syncRes || {}, false);
        return;
      }

      chrome.storage.local.get(PINNED_PREF_KEYS, (localRes) => callback(localRes || {}, true));
    });
  }

  function savePinnedPreferences(updates, callback) {
    const done = () => {
      if (typeof callback === 'function') callback();
    };

    if (preferenceStorageArea !== chrome.storage.local) {
      preferenceStorageArea.set(updates, () => {
        chrome.storage.local.set(updates, done);
      });
      return;
    }

    chrome.storage.local.set(updates, done);
  }

  function loadCustomPreferences(callback) {
    if (preferenceStorageArea === chrome.storage.local) {
      chrome.storage.local.get(CUSTOM_PREF_KEYS, (res) => callback(res || {}, false));
      return;
    }

    preferenceStorageArea.get(CUSTOM_PREF_KEYS, (syncRes) => {
      const hasSyncData = CUSTOM_PREF_KEYS.some((key) => syncRes && syncRes[key] !== undefined);
      if (hasSyncData) {
        callback(syncRes || {}, false);
        return;
      }

      chrome.storage.local.get(CUSTOM_PREF_KEYS, (localRes) => callback(localRes || {}, true));
    });
  }

  function saveCustomPreferences(updates, callback) {
    const done = () => {
      if (typeof callback === 'function') callback();
    };

    if (preferenceStorageArea !== chrome.storage.local) {
      preferenceStorageArea.set(updates, () => {
        chrome.storage.local.set(updates, done);
      });
      return;
    }

    chrome.storage.local.set(updates, done);
  }

  function migrateCustomPreferenceMap(map, tree) {
    const source = (map && typeof map === 'object') ? map : {};
    const migrated = {};
    const seenLegacyKeys = new Set();
    let changed = false;

    function walk(nodes, parentPathTitles = []) {
      (nodes || []).forEach((node) => {
        if (!node || node.id === '0') return;

        const stableKey = getNodePinKey(node, parentPathTitles);
        const legacyDomainKey = node.url ? (() => {
          try {
            return new URL(node.url).hostname;
          } catch (_) {
            return '';
          }
        })() : '';

        if (stableKey && Object.prototype.hasOwnProperty.call(source, stableKey)) {
          migrated[stableKey] = source[stableKey];
        } else if (legacyDomainKey && Object.prototype.hasOwnProperty.call(source, legacyDomainKey)) {
          migrated[stableKey] = source[legacyDomainKey];
          seenLegacyKeys.add(legacyDomainKey);
          changed = true;
        }

        if (Array.isArray(node.children) && node.children.length > 0) {
          walk(node.children, parentPathTitles.concat(node.title || ''));
        }
      });
    }

    walk(Array.isArray(tree) ? tree : []);

    Object.keys(source).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(migrated, key)) return;
      if (seenLegacyKeys.has(key)) return;
      if (!isStablePinKey(key)) {
        changed = true;
        return;
      }
      migrated[key] = source[key];
    });

    const sourceKeys = Object.keys(source);
    const migratedKeys = Object.keys(migrated);
    if (!changed && sourceKeys.length !== migratedKeys.length) {
      changed = true;
    }

    return { value: migrated, changed };
  }

  function isReusableNewTabUrl(url) {
    if (typeof url !== 'string' || !url) return false;

    return reusableNewTabUrls.some(candidate => (
      url === candidate
      || url.startsWith(`${candidate}?`)
      || url.startsWith(`${candidate}#`)
    ));
  }

  function isReusableNewTab(tab) {
    if (!tab || typeof tab !== 'object') return false;

    if (isReusableNewTabUrl(tab.url) || isReusableNewTabUrl(tab.pendingUrl)) {
      return true;
    }

    return tab.title === t('newtab.pageTitle', null, 'New Tab');
  }

  function getActiveTabAsync() {
    return new Promise(resolve => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(tabs && tabs[0] ? tabs[0] : null);
      });
    });
  }

  function updateTabAsync(tabId, updateProperties) {
    return new Promise((resolve, reject) => {
      chrome.tabs.update(tabId, updateProperties, (tab) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(tab);
      });
    });
  }

  function createTabAsync(createProperties) {
    return new Promise((resolve, reject) => {
      chrome.tabs.create(createProperties, (tab) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(tab);
      });
    });
  }

  function closePopupWindowIfNeeded({ active = true } = {}) {
    if (isSidePanel || !active) return;

    try {
      window.close();
    } catch (error) {
      console.warn('[Jade] Failed to close popup window after opening bookmark.', error);
    }
  }

  async function openBookmarkUrl(url, { active = true } = {}) {
    if (!url) return;

    if (!active) {
      await createTabAsync({ url, active: false });
      return;
    }

    const activeTab = await getActiveTabAsync();

    if (activeTab && typeof activeTab.id === 'number' && isReusableNewTab(activeTab)) {
      try {
        await updateTabAsync(activeTab.id, { url, active: true });
        closePopupWindowIfNeeded({ active });
        return;
      } catch (error) {
        console.warn('[Jade] Failed to reuse new tab, falling back to a new tab.', error);
      }
    }

    await createTabAsync({ url, active: true });
    closePopupWindowIfNeeded({ active });
  }

  function pruneDeadLinkProbeCache() {
    const now = Date.now();
    const entries = Object.entries(deadLinkProbeCache || {}).filter(([, entry]) => {
      if (!entry || typeof entry !== 'object') return false;
      const checkedAt = Number(entry.checkedAt || 0);
      if (!checkedAt || (now - checkedAt) > DEAD_LINK_CACHE_TTL_MS) return false;
      const probe = entry.probe;
      return !!(probe && typeof probe === 'object' && typeof probe.state === 'string');
    });

    entries.sort((a, b) => Number(b[1].checkedAt || 0) - Number(a[1].checkedAt || 0));
    deadLinkProbeCache = Object.fromEntries(entries.slice(0, DEAD_LINK_CACHE_MAX_ENTRIES));
  }

  function persistDeadLinkProbeCache() {
    pruneDeadLinkProbeCache();
    chrome.storage.local.set({ [DEAD_LINK_CACHE_KEY]: deadLinkProbeCache });
  }

  function schedulePersistDeadLinkProbeCache(delayMs = 200) {
    if (deadLinkCachePersistTimer) {
      clearTimeout(deadLinkCachePersistTimer);
    }
    deadLinkCachePersistTimer = setTimeout(() => {
      deadLinkCachePersistTimer = null;
      persistDeadLinkProbeCache();
    }, delayMs);
  }

  function invalidateBookmarkTreeCache() {
    if (bookmarkTreeCacheManager) {
      bookmarkTreeCacheManager.invalidate();
      return;
    }
    bookmarkTreeCacheFallback.data = null;
  }

  function setupBookmarkCacheInvalidation() {
    if (bookmarkTreeCacheManager) {
      bookmarkTreeCacheManager.setupInvalidation();
      return;
    }
    const invalidate = () => invalidateBookmarkTreeCache();
    const events = [
      chrome.bookmarks.onCreated,
      chrome.bookmarks.onRemoved,
      chrome.bookmarks.onChanged,
      chrome.bookmarks.onMoved,
      chrome.bookmarks.onChildrenReordered,
      chrome.bookmarks.onImportBegan,
      chrome.bookmarks.onImportEnded
    ];

    events.forEach((eventObj) => {
      if (eventObj && eventObj.addListener) {
        eventObj.addListener(invalidate);
      }
    });
  }

  function getBookmarkTreeCached(callback, options = {}) {
    if (bookmarkTreeCacheManager) {
      bookmarkTreeCacheManager.getTreeCached(callback, options);
      return;
    }
    const { forceRefresh = false } = options;
    const runCallback = (tree) => {
      if (typeof callback === 'function') {
        callback(Array.isArray(tree) ? tree : []);
      }
    };

    if (!forceRefresh && bookmarkTreeCacheFallback.data) {
      runCallback(bookmarkTreeCacheFallback.data);
      return;
    }

    if (!forceRefresh && bookmarkTreeCacheFallback.inFlight) {
      bookmarkTreeCacheFallback.inFlight.then(runCallback);
      return;
    }

    const request = new Promise((resolve) => {
      chrome.bookmarks.getTree((tree) => {
        if (chrome.runtime.lastError) {
          console.warn('[Jade] Failed to get bookmark tree:', chrome.runtime.lastError.message);
          resolve([]);
          return;
        }
        bookmarkTreeCacheFallback.data = tree;
        resolve(tree);
      });
    });

    bookmarkTreeCacheFallback.inFlight = request.finally(() => {
      if (bookmarkTreeCacheFallback.inFlight === request) {
        bookmarkTreeCacheFallback.inFlight = null;
      }
    });

    request.then(runCallback);
  }

  // 借助 chrome.extension.getViews 探测侧边栏，这比 innerHeight 更可靠
  let isSidePanel = false;
  if (window.location.search.includes('sidepanel')) {
    isSidePanel = true;
  } else {
    try {
      if (chrome.extension && chrome.extension.getViews) {
        // 如果当前窗口不在 popup 窗口列表中，说明它是侧边栏（或其他视图）
        const popupViews = chrome.extension.getViews({ type: 'popup' });
        isSidePanel = !popupViews.includes(window);
      } else {
        isSidePanel = window.innerHeight > 600; // 最基础回退
      }
    } catch (e) {
      isSidePanel = window.innerHeight > 600;
    }
  }
  document.documentElement.setAttribute('data-layout', isSidePanel ? 'sidepanel' : 'popup');

  // 检测操作系统以显示快捷键提示
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  if (shortcutHint) {
    shortcutHint.textContent = isMac
      ? t('popup.shortcutMac', null, '⌘K')
      : t('popup.shortcutWin', null, 'Ctrl K');
  }

  function init() {
    setupBookmarkCacheInvalidation();

    loadPinnedPreferences((pinRes, shouldBackfillSync) => {
      loadCustomPreferences((customRes, shouldBackfillCustomSync) => {
        chrome.storage.local.get(
          ['hidden_recent_urls', DEAD_LINK_CACHE_KEY],
          (res) => {
            if (res.hidden_recent_urls) {
              hiddenRecentUrls = res.hidden_recent_urls;
            }
            if (res[DEAD_LINK_CACHE_KEY] && typeof res[DEAD_LINK_CACHE_KEY] === 'object') {
              deadLinkProbeCache = res[DEAD_LINK_CACHE_KEY];
              pruneDeadLinkProbeCache();
              schedulePersistDeadLinkProbeCache(800);
            }

            getBookmarkTreeCached((tree) => {
              const { idToPinKey } = buildPinMaps(tree);
              const migratedPinned = migrateStoredPinList(pinRes.pinned_bookmarks, idToPinKey);
              const migratedOrder = migrateStoredPinList(pinRes.frequent_order, idToPinKey);
              const migratedCustomTitles = migrateCustomPreferenceMap(customRes.frequent_custom_titles, tree);
              const migratedCustomUrls = migrateCustomPreferenceMap(customRes.frequent_custom_urls, tree);

              pinnedIds = new Set(migratedPinned.value);
              frequentOrder = migratedOrder.value;
              frequentCustomTitles = migratedCustomTitles.value;
              frequentCustomUrls = migratedCustomUrls.value;

              if (shouldBackfillSync || migratedPinned.changed || migratedOrder.changed) {
                savePinnedPreferences({
                  pinned_bookmarks: Array.from(pinnedIds),
                  frequent_order: frequentOrder
                });
              }

              if (shouldBackfillCustomSync || migratedCustomTitles.changed || migratedCustomUrls.changed) {
                saveCustomPreferences({
                  frequent_custom_titles: frequentCustomTitles,
                  frequent_custom_urls: frequentCustomUrls
                });
              }

              chrome.bookmarks.get('1', (nodes) => {
                if (nodes && nodes.length > 0) {
                  const bookmarkBar = nodes[0];
                  navigationStack = [{ id: bookmarkBar.id, title: bookmarkBar.title || t('popup.bookmarkBar', null, 'Bookmark Bar') }];
                  buildDashboard();
                }
              });
            });
          }
        );
      });
    });

    setupGlobalListeners();
  }

  function setupGlobalListeners() {
    // 全局快捷键 Cmd+K / Ctrl+K 聚焦搜索框
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInput.focus();
      }
    });

    // 搜索框输入事件
    searchInput.addEventListener('input', handleSearch);

    // ESC 和 键盘导航
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        clearSearch();
      } else if (e.key === 'Enter') {
        const firstResult = bookmarkList.querySelector('.bookmark-item');
        if (firstResult) {
          firstResult.click();
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const firstResult = bookmarkList.querySelector('.bookmark-item');
        if (firstResult) firstResult.focus();
      }
    });

    // 点击任意地方收起菜单
    document.addEventListener('click', (e) => {
      contextMenu.style.display = 'none';
    });

    // 底部按钮
    if (btnManageBookmarksBtn) {
      btnManageBookmarksBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'chrome://bookmarks/' });
      });
    }

    if (btnHistoryBtn) {
      btnHistoryBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'chrome://history/' });
      });
    }

    if (openToolboxBtn) {
      openToolboxBtn.addEventListener('click', () => {
        toolsModal.style.display = 'flex';
        // 每次打开时，重置为菜单视图
        closeToolView();
      });
    }

    if (toolsCloseBtn) {
      toolsCloseBtn.addEventListener('click', () => {
        cancelBrokenLinkScanSilently();
        toolsModal.style.display = 'none';
      });
    }

    if (toolsBackBtn) {
      toolsBackBtn.addEventListener('click', () => {
        closeToolView();
      });
    }

    setupContextMenuAndModals();
    setupToolsListeners();
  }

  // --- 仪表盘构建器 (启动器视图) ---
  function buildDashboard() {
    frequentSection.style.display = 'block';
    categorySection.style.display = 'block';
    bookmarkList.style.display = 'none';
    breadcrumb.style.display = 'none';

    // 1. Build Frequents (Top level folders or pinned items)
    buildFrequents();

    // 2. Build Recent Context
    buildRecents();

    // 3. Build Category Cards (Folders mapping)
    buildCategories();
  }

  function buildFrequents() {
    frequentSection.style.display = 'block';
    frequentGrid.innerHTML = '';

    const renderData = (frequents) => {
      frequentGrid.innerHTML = '';
      currentFrequentItems = frequents.slice(0, 8);
      let dragSrcIndex = null;

      if (currentFrequentItems.length === 0) {
        frequentGrid.innerHTML = `
          <div class="empty-pinned-state empty-pinned-span-full">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
            </svg>
            <div>${t('popup.emptyPinned', null, 'Add your most visited sites here.<br>Up to 8 items, managed manually by you.')}</div>
          </div>
        `;
        return;
      }

      currentFrequentItems.forEach((item, itemIndex) => {
        const a = document.createElement('a');
        const isPinned = true;
        const isFolder = !item.url;
        a.className = 'frequent-card is-pinned';
        a.href = '#';
        if (!isFolder) a.title = item.url;
        a.draggable = true;
        a.dataset.index = itemIndex;

        let domain = item.domain;
        if (!domain && !isFolder) {
          try { domain = new URL(item.url || 'about:blank').hostname; } catch (e) { domain = 'unknown'; }
        }

        const itemKey = item.pinKey || item.id || domain;
        let shortName = frequentCustomTitles[itemKey] || item.title || domain || t('common.untitledFolder', null, 'Untitled folder');
        shortName = shortName.split(' - ')[0].split(' | ')[0].split(' _ ')[0].trim();
        if (shortName.length > 10) shortName = shortName.substring(0, 10) + '..';

        const iconHtml = isFolder
          ? `<svg class="icon-muted" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
               <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
             </svg>`
          : `<img src="chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(item.url)}&size=128"
                  class="frequent-favicon">`;

        a.innerHTML = `
              <div class="frequent-actions" title="${escapeHtmlAttr(t('popup.pinCardTitle', null, 'Unpin'))}">
                  <svg class="pin-indicator-icon" width="12" height="12" viewBox="0 0 24 24" fill="var(--accent-color)" stroke="var(--accent-color)" stroke-width="2.5"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
              </div>
              <div class="frequent-icon-wrap">
                  ${iconHtml}
              </div>
              <span class="frequent-title">${escapeHtml(shortName)}</span>
          `;

        if (!isFolder) {
          const frequentFavicon = a.querySelector('.frequent-favicon');
          bindFaviconFallback(frequentFavicon, domain, 128);
        }

        a.onclick = (e) => {
          e.preventDefault();
          if (isFolder) {
            enterFolder(item.id, item.title, item.isUncategorized);
          } else {
            void openBookmarkUrl(frequentCustomUrls[itemKey] || item.url);
          }
        };

        a.addEventListener('mouseenter', () => {
          const svg = a.querySelector('.frequent-actions svg');
          if (svg) svg.style.opacity = '1';
        });
        a.addEventListener('mouseleave', () => {
          const svg = a.querySelector('.frequent-actions svg');
          if (svg) svg.style.opacity = '0';
        });

        // 直接点击固定图标 (从置顶移除)
        a.querySelector('.frequent-actions').addEventListener('click', (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();

          const svg = a.querySelector('.frequent-actions svg');
          if (svg) {
            svg.style.transition = 'transform 0.1s ease-out';
            svg.style.transform = 'rotate(45deg) scale(1.15)';
            setTimeout(() => {
              svg.style.transition = 'transform 0.1s ease-in';
              svg.style.transform = 'rotate(45deg) scale(1)';
            }, 100);
          }

          const targetId = item.pinKey || item.id || domain;
          setTimeout(() => {
            if (pinnedIds.has(targetId)) {
              removeFromPinnedWithUndo(targetId, itemIndex);
            }
          }, 200);
        });

        // --- 拖拽排序 ---
        a.addEventListener('dragstart', (e) => {
          dragSrcIndex = itemIndex;
          a.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', itemIndex);
        });

        a.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          frequentGrid.querySelectorAll('.frequent-card').forEach(c => c.classList.remove('drag-over'));
          if (parseInt(a.dataset.index) !== dragSrcIndex) {
            a.classList.add('drag-over');
          }
        });

        a.addEventListener('dragleave', () => {
          a.classList.remove('drag-over');
        });

        a.addEventListener('drop', (e) => {
          e.preventDefault();
          a.classList.remove('drag-over');
          const fromIndex = dragSrcIndex;
          const toIndex = parseInt(a.dataset.index);
          if (fromIndex === null || fromIndex === toIndex) return;

          const movedItem = currentFrequentItems.splice(fromIndex, 1)[0];
          currentFrequentItems.splice(toIndex, 0, movedItem);

          frequentOrder = currentFrequentItems.map(it => it.pinKey || it.id || it.domain || '');
          savePinnedPreferences({ frequent_order: frequentOrder });

          renderData(currentFrequentItems);
        });

        a.addEventListener('dragend', () => {
          a.classList.remove('dragging');
          frequentGrid.querySelectorAll('.frequent-card').forEach(c => c.classList.remove('drag-over'));
        });

        // 右键菜单显示
        a.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          targetNodeId = item.id || null;
          targetNodePinKey = item.pinKey || getItemPinKey(item);
          targetFrequentKey = item.pinKey || getItemPinKey(item);
          targetNodeDomain = domain;
          targetFrequentUrl = item.url || '';
          targetNodeIsFolder = false;
          showContextMenu(e, false, true);
        });

        frequentGrid.appendChild(a);
      });
    };

    getBookmarkTreeCached((tree) => {
      let pinnedNodes = [];
      function traverse(nodes, parentPathTitles = []) {
        nodes.forEach(n => {
          const pinKey = getNodePinKey(n, parentPathTitles);
          const nextPath = n.id === '0'
            ? parentPathTitles
            : parentPathTitles.concat(n.title || '');
          if (pinKey && pinnedIds.has(pinKey)) {
            pinnedNodes.push({ ...n, pinKey });
          }
          if (n.children) traverse(n.children, nextPath);
        });
      }
      traverse(tree);

      // 清理已经无法在书签树中解析的置顶键
      const foundIds = new Set(pinnedNodes.map(n => n.pinKey));
      const orphanIds = Array.from(pinnedIds).filter(id => !foundIds.has(id));
      if (orphanIds.length > 0) {
        orphanIds.forEach(id => pinnedIds.delete(id));
        savePinnedPreferences({ pinned_bookmarks: Array.from(pinnedIds) });
        console.info(`[Jade] 已清理 ${orphanIds.length} 个无效置顶 ID:`, orphanIds);
      }

      const pinnedOrder = Array.from(pinnedIds);
      pinnedNodes.sort((a, b) => {
        const idA = a.pinKey;
        const idB = b.pinKey;
        const indexA = pinnedOrder.indexOf(idA);
        const indexB = pinnedOrder.indexOf(idB);
        return indexA - indexB;
      });

      let finalItems = pinnedNodes;

      // 应用用户自定义的排序 (frequentOrder)
      finalItems.sort((a, b) => {
        const idA = a.pinKey;
        const idB = b.pinKey;
        const indexA = frequentOrder.indexOf(idA);
        const indexB = frequentOrder.indexOf(idB);

        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return 0;
      });

      renderData(finalItems.slice(0, 8));
    });
  }

  function buildRecents() {
    recentListView.innerHTML = '';
    recentSection.style.display = 'none';

    // 聚合最近关闭的标签和最近历史记录
    chrome.sessions.getRecentlyClosed({ maxResults: 3 }, (sessions) => {
      const recentItems = [];
      if (sessions) {
        sessions.forEach(session => {
          if (session.tab) {
            recentItems.push({
              title: session.tab.title,
              url: session.tab.url,
              type: t('popup.recentClosed', null, 'Recently Closed'),
              timestamp: session.lastModified
            });
          }
        });
      }

      // 补充历史记录
      chrome.history.search({ text: '', maxResults: 15, startTime: Date.now() - 24 * 3600 * 1000 }, (historyItems) => {
        const hItems = historyItems.filter(hi => !recentItems.find(ri => ri.url === hi.url)).map(hi => ({
          title: hi.title || hi.url,
          url: hi.url,
          id: hi.id,
          type: t('popup.history', null, 'History'),
          timestamp: hi.lastVisitTime
        }));

        const combined = [...recentItems, ...hItems]
          .filter(item => !hiddenRecentUrls.includes(item.url))
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 5);

        recentSection.style.display = 'block';
        if (combined.length === 0) {
          recentListView.innerHTML = `
            <div class="empty-state">
              ${t('popup.noRecentVisits', null, 'No recent visits yet')}
            </div>
          `;
          return;
        }

        combined.forEach(item => {
          const a = document.createElement('a');
          a.className = 'recent-item';
          a.href = '#';

          // 最近访问右键菜单
          a.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            targetNodeDomain = item.url; // 借用 domain 存储 url 或 id 以供后续移除动作
            targetNodePinKey = null;
            targetFrequentKey = null;
            showContextMenu(e, false, false, true);
          });

          let domain = '';
          try {
            domain = new URL(item.url || 'about:blank').hostname;
          } catch (e) {
            domain = '';
          }

          const timeAgo = getTimeAgo(item.timestamp || Date.now());
          const metaInfo = item.type === t('popup.history', null, 'History') ? timeAgo : `${item.type} · ${timeAgo}`;

          a.innerHTML = `
                <div class="recent-favicon">
                  <img src="chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(item.url)}&size=32"
                       class="recent-favicon-img">
                </div>
                <div class="recent-info">
                  <div class="recent-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
                  <div class="recent-meta">${escapeHtml(metaInfo)}</div>
                </div>
            `;

          const recentFavicon = a.querySelector('.recent-favicon-img');
          bindFaviconFallback(recentFavicon, domain, 32);

          a.onclick = (e) => {
            e.preventDefault();
            void openBookmarkUrl(item.url);
          };

          recentListView.appendChild(a);
        });
      });
    });
  }

  function buildCategories() {
    categoryGrid.innerHTML = '';

    getBookmarkTreeCached((tree) => {
      const rootNodes = tree[0].children; // [Bookmarks Bar, Other Bookmarks]
      const folders = [];
      const rootBookmarks = [];

      // 提取书签栏和其他书签下的内容
      rootNodes.forEach(rootNode => {
        if (rootNode.children) {
          rootNode.children.forEach(child => {
            if (child.url) {
              // 记录根目录下的直属书签
              rootBookmarks.push({ ...child, parentTitle: rootNode.title || t('popup.rootFolder', null, 'Root') });
            } else {
              folders.push(child);
            }
          });
        }
      });

      // 2. 处理文件夹：取前 5 个包含内容的文件夹 (预留位置给虚拟卡片)
      const validFolders = folders.filter(f => f.children && f.children.length > 0).slice(0, 5);

      if (validFolders.length === 0 && rootBookmarks.length === 0) {
        categorySection.style.display = 'none';
        return;
      }

      categorySection.style.display = 'block';

      // 先渲染文件夹
      validFolders.forEach(folder => {
        renderCategoryCard(folder);
      });

      // 再将“未分类书签”放到末尾
      if (rootBookmarks.length > 0) {
        const virtualFolder = {
          id: '1', // 默认跳转到书签栏 (ID 1)
          title: t('popup.uncategorizedBookmarks', null, 'Uncategorized Bookmarks'),
          isUncategorized: true, // 增加专属标记
          children: rootBookmarks
        };
        renderCategoryCard(virtualFolder);
      }
    });
  }

  function renderCategoryCard(folder) {
    const card = document.createElement('div');
    card.className = 'category-card';

    let previewHtml = '';
    const previewItems = folder.children.filter(c => c.url).slice(0, 3);

    previewItems.forEach(item => {
      const domain = new URL(item.url || 'about:blank').hostname;
      let shortName = item.title || domain;
      // 保持简洁，一行一个
      if (shortName.length > 20) shortName = shortName.substring(0, 20) + '..';

      previewHtml += `
            <div class="cat-preview-item">
              <img src="chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(item.url)}&size=32"
                   class="cat-preview-icon">
              <span class="cat-preview-text">${escapeHtml(shortName)}</span>
            </div>
          `;
    });

    card.innerHTML = `
            <div class="cat-header-row">
                <div class="cat-title-group">
                    <span class="cat-title" title="${escapeHtml(folder.title)}">${escapeHtml(folder.title)}</span>
                </div>
                <span class="cat-count-badge">${folder.children.length}</span>
            </div>
            <div class="cat-preview-list">
                ${previewHtml}
            </div>
        `;

    card.querySelectorAll('.cat-preview-icon').forEach((img, index) => {
      const item = previewItems[index];
      if (!item) return;
      const domain = new URL(item.url || 'about:blank').hostname;
      bindFaviconFallback(img, domain, 32);
    });

    card.onclick = () => {
      enterFolder(folder.id, folder.title, folder.isUncategorized);
    };

    // Context menu
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      targetNodeId = folder.id;
      targetNodeIsFolder = true;
      targetNodePinKey = getItemPinKey(folder);
      targetFrequentKey = null;
      showContextMenu(e, true);
    });

    categoryGrid.appendChild(card);
  }

  function getTimeAgo(timestamp) {
    if (dashboardModule && typeof dashboardModule.getTimeAgo === 'function') {
      return dashboardModule.getTimeAgo(timestamp);
    }
    if (!timestamp) return t('common.unknownTime', null, 'Unknown time');
    let ts = timestamp;
    if (ts < 10000000000) ts *= 1000;

    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);

    if (mins < 1) return t('common.justNow', null, 'Just now');
    if (mins < 60) return t('common.minutesAgo', { count: mins }, `${mins} min ago`);

    const date = new Date(ts);
    const today = new Date();

    // 检查是否为今天
    const isToday = date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();

    // 检查是否为昨天
    const yesterday = new Date(today.getTime() - 86400000);
    const isYesterday = date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    const hh = date.getHours().toString().padStart(2, '0');
    const mm = date.getMinutes().toString().padStart(2, '0');

    if (isToday) return t('common.todayTime', { time: `${hh}:${mm}` }, `Today ${hh}:${mm}`);
    if (isYesterday) return t('common.yesterdayTime', { time: `${hh}:${mm}` }, `Yesterday ${hh}:${mm}`);

    return t('common.monthDay', { month: date.getMonth() + 1, day: date.getDate() }, `${date.getMonth() + 1}/${date.getDate()}`);
  }

  // --- 标准文件夹导航 ---
  function enterFolder(id, title, isUncategorized = false) {
    isSearching = false;
    searchInput.value = '';
    navigationStack.push({ id, title, isUncategorized });

    frequentSection.style.display = 'none';
    recentSection.style.display = 'none';
    categorySection.style.display = 'none';
    breadcrumb.style.display = 'flex';
    bookmarkList.style.display = 'flex';

    loadStandardFolder(id, isUncategorized);
  }

  function loadStandardFolder(id, isUncategorized = false) {
    currentFolderId = id;

    if (isUncategorized) {
      getBookmarkTreeCached((tree) => {
        const rootNodes = tree[0].children;
        const rootBookmarks = [];
        // 汇集所有的根目录直属书签
        rootNodes.forEach(rootNode => {
          if (rootNode.children) {
            rootNode.children.forEach(child => {
              if (child.url) {
                rootBookmarks.push({ ...child, parentTitle: rootNode.title || t('popup.rootFolder', null, 'Root') });
              }
            });
          }
        });
        renderStandardList(rootBookmarks);
        updateBreadcrumbUI();
      });
      return;
    }

    chrome.bookmarks.getChildren(id, (children) => {
      renderStandardList(children);
      updateBreadcrumbUI();
    });
  }

  function updateBreadcrumbUI(searchQuery = null) {
    breadcrumb.innerHTML = '';

    if (searchQuery) {
      breadcrumb.style.display = 'flex';
      const span = document.createElement('span');
      span.textContent = t('popup.searchResultLabel', { query: searchQuery }, `Search: "${searchQuery}"`);
      breadcrumb.appendChild(span);

      const clearBtn = document.createElement('span');
      clearBtn.textContent = t('popup.clearSearch', null, 'Clear');
      clearBtn.style.marginLeft = 'auto';
      clearBtn.style.color = 'var(--accent-color)';
      clearBtn.onclick = clearSearch;
      breadcrumb.appendChild(clearBtn);
      return;
    }

    if (navigationStack.length <= 1) {
      // If back at root, just show dashboard
      buildDashboard();
      return;
    }

    const backBtn = document.createElement('span');
    backBtn.innerHTML = `<svg class="inline-back-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg> ${escapeHtml(t('popup.backButton', null, 'Back'))}`;

    // 允许拖放到“返回”按钮上 (移动到上一级)
    const parentNode = navigationStack.length > 1 ? navigationStack[navigationStack.length - 2] : null; // 上一级目录 (或 undefined 当返回首页时不支持)
    if (parentNode && parentNode.id !== '0') {
      backBtn.addEventListener('dragover', (e) => { e.preventDefault(); backBtn.classList.add('drag-over'); e.dataTransfer.dropEffect = 'move'; });
      backBtn.addEventListener('dragleave', () => backBtn.classList.remove('drag-over'));
      backBtn.addEventListener('drop', (e) => {
        e.preventDefault();
        backBtn.classList.remove('drag-over');
        if (!draggedItemId) return;
        chrome.bookmarks.move(draggedItemId, { parentId: parentNode.id }, () => {
          if (!chrome.runtime.lastError && currentFolderId) {
            invalidateBookmarkTreeCache();
            loadStandardFolder(currentFolderId);
          }
        });
      });
    }

    backBtn.onclick = () => {
      navigationStack.pop();
      if (navigationStack.length > 0) {
        const parent = navigationStack[navigationStack.length - 1];
        if (navigationStack.length === 1) buildDashboard();
        else loadStandardFolder(parent.id, parent.isUncategorized);
      }
    };
    breadcrumb.appendChild(backBtn);

    const sep = document.createElement('span');
    sep.className = 'separator';
    sep.textContent = '|';
    breadcrumb.appendChild(sep);

    navigationStack.slice(1).forEach((crumb, index, arr) => {
      const span = document.createElement('span');
      span.textContent = crumb.title;

      // 允许拖放到中间任意一层级名上 (非当前目录时有效, 即并非最后一个子节点)
      if (index < arr.length - 1 && crumb.id !== '0') {
        span.addEventListener('dragover', (e) => { e.preventDefault(); span.classList.add('drag-over'); e.dataTransfer.dropEffect = 'move'; });
        span.addEventListener('dragleave', () => span.classList.remove('drag-over'));
        span.addEventListener('drop', (e) => {
          e.preventDefault();
          span.classList.remove('drag-over');
          if (!draggedItemId) return;
          chrome.bookmarks.move(draggedItemId, { parentId: crumb.id }, () => {
            if (!chrome.runtime.lastError && currentFolderId) {
              invalidateBookmarkTreeCache();
              loadStandardFolder(currentFolderId);
            }
          });
        });
      }

      span.onclick = () => {
        navigationStack = navigationStack.slice(0, index + 2);
        loadStandardFolder(crumb.id);
      };
      breadcrumb.appendChild(span);

      if (index < arr.length - 1) {
        const sep2 = document.createElement('span');
        sep2.className = 'separator';
        sep2.textContent = '/';
        breadcrumb.appendChild(sep2);
      }
    });
  }

  // --- SEARCH HANDLING ---
  function handleSearch() {
    const query = searchInput.value.trim();
    if (query === '') {
      clearSearch();
      return;
    }

    isSearching = true;
    frequentSection.style.display = 'none';
    recentSection.style.display = 'none';
    categorySection.style.display = 'none';
    breadcrumb.style.display = 'flex';
    bookmarkList.style.display = 'flex';

    updateBreadcrumbUI(query);

    Promise.all([
      new Promise(resolve => chrome.bookmarks.search(query, resolve)),
      new Promise(resolve => {
        if (chrome.sessions && chrome.sessions.getRecentlyClosed) {
          chrome.sessions.getRecentlyClosed({ maxResults: 10 }, (sessions) => {
            if (chrome.runtime.lastError) { resolve([]); return; }
            const recentTabs = [];
            sessions.forEach(session => {
              if (session.tab && session.tab.title.toLowerCase().includes(query.toLowerCase())) {
                recentTabs.push({ title: session.tab.title, url: session.tab.url, meta: t('popup.sessionsMeta', null, '[Recently Closed]') });
              } else if (session.window && session.window.tabs) {
                session.window.tabs.forEach((tabItem) => {
                  if (tabItem.title.toLowerCase().includes(query.toLowerCase())) {
                    recentTabs.push({ title: tabItem.title, url: tabItem.url, meta: t('popup.sessionWindowMeta', null, '[Recently Closed Window]') });
                  }
                });
              }
            });
            resolve(recentTabs);
          });
        } else {
          resolve([]);
        }
      })
    ]).then(([bookmarksResults, sessionsResults]) => {
      renderStandardList([...sessionsResults, ...bookmarksResults], true);
    });
  }

  function clearSearch() {
    searchInput.value = '';
    isSearching = false;
    if (navigationStack.length <= 1) {
      buildDashboard();
    } else {
      loadStandardFolder(navigationStack[navigationStack.length - 1].id);
    }
  }

  function renderStandardList(items, isSearchResult = false) {
    bookmarkList.innerHTML = '';

    if (items.length === 0) {
      bookmarkList.innerHTML = `<div class="empty-state">${isSearchResult ? t('popup.emptySearch', null, 'No matches found') : t('popup.emptyFolder', null, 'This folder is empty')}</div>`;
      return;
    }

    items.forEach((item) => {
      const a = document.createElement('a');
      const isFolder = !item.url;

      a.className = 'bookmark-item';
      a.href = '#';
      if (item.url) a.title = item.url;

      // Accessibility for keyboard nav
      a.tabIndex = 0;

      const domain = isFolder ? '' : new URL(item.url || 'about:blank').hostname;

      const iconHtml = isFolder
        ? `<div class="bookmark-icon">
            <svg class="icon-muted" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
            </svg>
           </div>`
        : `<div class="bookmark-icon">
            <img src="chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(item.url)}&size=64"
                 alt="">
           </div>`;

      const displayTitle = item.title || (isFolder
        ? t('common.untitledFolder', null, 'Untitled folder')
        : t('common.untitled', null, 'Untitled'));
      const titleHtml = isSearchResult
        ? highlightText(displayTitle, searchInput.value.trim())
        : escapeHtml(displayTitle);

      const metaSpan = item.meta ? `<span class="recent-meta">${item.meta}</span>` : '';

      a.innerHTML = `
        ${iconHtml}
        <div class="bookmark-info">
          <span class="bookmark-title ${isFolder ? 'bookmark-title-folder' : ''}">${titleHtml}</span>
          ${metaSpan}
        </div>
      `;

      if (!isFolder) {
        const iconImg = a.querySelector('.bookmark-icon img');
        if (iconImg) {
          bindFaviconFallback(iconImg, domain, 64);
        }
      }

      a.onclick = (e) => {
        e.preventDefault();
        if (isFolder) {
          enterFolder(item.id, item.title);
        } else {
          void openBookmarkUrl(item.url);
        }
      };

      // Keyboard enter key
      a.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (e.metaKey || e.ctrlKey) {
            // Open in background tab
            if (!isFolder) void openBookmarkUrl(item.url, { active: false });
          } else {
            a.click();
          }
        }
      });

      // Context menu
      a.addEventListener('contextmenu', (e) => {
        if (item.meta) return; // Don't show menu for sessions/history injected items in search
        e.preventDefault();
        targetNodeId = item.id;
        targetNodeIsFolder = isFolder;
        targetNodePinKey = getItemPinKey(item, getCurrentFolderPathTitles());
        targetFrequentKey = null;
        showContextMenu(e, isFolder);
      });

      // 拖拽排序逻辑 (仅在非搜索的真实文件夹内生效)
      if (!isSearchResult && item.id) {
        a.draggable = true;

        a.addEventListener('dragstart', (e) => {
          draggedItem = a;
          draggedItemId = item.id;
          setTimeout(() => a.classList.add('dragging'), 0);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', item.id);
        });

        a.addEventListener('dragend', () => {
          a.classList.remove('dragging');
          Array.from(bookmarkList.children).forEach(child => child.classList.remove('drag-over'));
          draggedItem = null;
          draggedItemId = null;
        });

        a.addEventListener('dragleave', () => {
          a.classList.remove('drag-over');
          a.classList.remove('drag-into');
        });

        a.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (!draggedItem || draggedItem === a) return;

          e.dataTransfer.dropEffect = 'move';
          const rect = a.getBoundingClientRect();
          const y = e.clientY - rect.top;

          a.classList.remove('drag-over', 'drag-into');

          // 如果悬停目标是文件夹，且鼠标在其垂直中间 60% 区域，视为“拖入其中”
          if (isFolder && y > rect.height * 0.2 && y < rect.height * 0.8) {
            a.classList.add('drag-into');
          } else {
            a.classList.add('drag-over');
          }
        });

        a.addEventListener('drop', (e) => {
          e.preventDefault();
          const isInto = a.classList.contains('drag-into');
          a.classList.remove('drag-over', 'drag-into');

          if (!draggedItemId || draggedItemId === item.id) return;

          // 场景 1: 跨级拖入某个文件夹内部
          if (isInto && isFolder) {
            chrome.bookmarks.move(draggedItemId, {
              parentId: item.id
            }, () => {
              if (!chrome.runtime.lastError && currentFolderId) {
                invalidateBookmarkTreeCache();
                loadStandardFolder(currentFolderId);
              }
            });
            return;
          }

          // 场景 2: 同级之间重新排序
          const itemsArray = Array.from(bookmarkList.children);
          const draggedIndex = itemsArray.indexOf(draggedItem);
          const dropIndex = itemsArray.indexOf(a);

          chrome.bookmarks.move(draggedItemId, {
            parentId: item.parentId,
            index: dropIndex
          }, () => {
            if (!chrome.runtime.lastError && currentFolderId) {
              invalidateBookmarkTreeCache();
              loadStandardFolder(currentFolderId);
            }
          });
        });
      }

      bookmarkList.appendChild(a);
    });
  }

  function highlightText(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const queryEscaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${queryEscaped})`, 'gi');
    return escaped.replace(regex, '<mark>$1</mark>');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeHtmlAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function bindFaviconFallback(img, domain, size) {
    if (!img || !domain) return;
    img.addEventListener('error', () => {
      if (img.dataset.fallbackApplied === '1') return;
      img.dataset.fallbackApplied = '1';
      img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
    }, { once: true });
  }

  function resolveConfirmModal(result) {
    if (confirmModal) confirmModal.style.display = 'none';
    if (confirmKeydownHandler) {
      document.removeEventListener('keydown', confirmKeydownHandler);
      confirmKeydownHandler = null;
    }
    if (!confirmResolver) return;
    const resolver = confirmResolver;
    confirmResolver = null;
    resolver(result);
  }

  function confirmDangerAction(message, options = {}) {
    const {
      title = t('popup.confirm.defaultTitle', null, 'Confirm Action'),
      hint = t('popup.confirm.defaultHint', null, 'This action cannot be undone. Continue?'),
      okText = t('common.continue', null, 'Continue'),
      variant = 'danger'
    } = options;

    if (!confirmModal || !confirmOkBtn || !confirmCancelBtn || !confirmModalMessage) {
      return Promise.resolve(confirm(`⚠️ ${message}\n\n${hint}`));
    }

    if (confirmResolver) {
      resolveConfirmModal(false);
    }

    if (confirmModalTitle) confirmModalTitle.textContent = title;
    confirmModalMessage.textContent = message;
    if (confirmModalHint) confirmModalHint.textContent = hint;
    confirmOkBtn.textContent = okText;
    if (confirmModalContent) {
      confirmModalContent.classList.remove('confirm-normal', 'confirm-danger');
      confirmModalContent.classList.add(variant === 'normal' ? 'confirm-normal' : 'confirm-danger');
    }
    confirmOkBtn.classList.remove('confirm-ok-danger', 'confirm-ok-normal');
    confirmOkBtn.classList.add(variant === 'normal' ? 'confirm-ok-normal' : 'confirm-ok-danger');

    confirmModal.style.display = 'flex';
    confirmCancelBtn.focus();

    confirmOkBtn.onclick = () => resolveConfirmModal(true);
    confirmCancelBtn.onclick = () => resolveConfirmModal(false);
    confirmModal.onclick = (e) => {
      if (e.target === confirmModal) {
        resolveConfirmModal(false);
      }
    };

    confirmKeydownHandler = (e) => {
      if (!confirmModal || confirmModal.style.display !== 'flex') return;
      if (e.key === 'Escape') {
        e.preventDefault();
        resolveConfirmModal(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        resolveConfirmModal(true);
      }
    };
    document.addEventListener('keydown', confirmKeydownHandler);

    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  function cancelBrokenLinkScanSilently() {
    if (!brokenLinkScanSession || brokenLinkScanSession.cancelled) return;
    if (toolsModule && toolsModule.cancelScan) {
      toolsModule.cancelScan(brokenLinkScanSession);
    } else {
      brokenLinkScanSession.cancelled = true;
      brokenLinkScanSession.controllers.forEach(controller => controller.abort());
      brokenLinkScanSession.controllers.clear();
    }
    brokenLinkScanSession = null;
  }

  function getBrokenProbeReasonLabel(probe) {
    if (!probe) return t('popup.reasons.unknown', null, 'Unknown reason');
    if (probe.reason === 'http_404') return t('popup.reasons.http404', null, 'HTTP 404 (Not Found)');
    if (probe.reason === 'http_410') return t('popup.reasons.http410', null, 'HTTP 410 (Gone)');
    if (probe.reason === 'http_451') return t('popup.reasons.http451', null, 'HTTP 451 (Unavailable for Legal Reasons)');
    if (probe.reason === 'network_failure') return t('popup.reasons.networkFailure', null, 'Network request failed');
    if (probe.reason === 'timeout') return t('popup.reasons.timeout', null, 'Request timed out');
    if (probe.reason === 'head_blocked') return t('popup.reasons.headBlocked', null, 'HEAD request blocked');
    if (probe.reason === 'head_inconclusive') return t('popup.reasons.headInconclusive', null, 'HEAD result was inconclusive');
    if (probe.reason === 'opaque_get') return t('popup.reasons.opaqueGet', null, 'Reachable only with no-cors (needs review)');
    if (probe.reason && probe.reason.startsWith('http_')) return `HTTP ${probe.reason.replace('http_', '')}`;
    return probe.reason || t('popup.reasons.unknown', null, 'Unknown reason');
  }

  function setToolDetailStatusText(text, tone = 'muted', strong = false) {
    const classes = ['tool-status-text', `tool-status-${tone}`];
    if (strong) classes.push('tool-status-strong');
    toolDetailStatus.innerHTML = `<span class="${classes.join(' ')}">${escapeHtml(String(text || ''))}</span>`;
  }

  function setToolsResultMessage(message, tone = 'muted') {
    toolsResultList.innerHTML = `<div class="tool-result-message tool-result-${tone}">${escapeHtml(String(message || ''))}</div>`;
  }

  let undoTimeout = null;
  function resolveToastOptions(optionsOrUndo) {
    if (typeof optionsOrUndo === 'function') {
      return { undoCallback: optionsOrUndo, tone: 'info' };
    }
    if (optionsOrUndo && typeof optionsOrUndo === 'object') {
      return {
        undoCallback: typeof optionsOrUndo.undoCallback === 'function' ? optionsOrUndo.undoCallback : null,
        tone: typeof optionsOrUndo.tone === 'string' && optionsOrUndo.tone ? optionsOrUndo.tone : 'info'
      };
    }
    return { undoCallback: null, tone: 'info' };
  }

  function getToastIconByTone(tone) {
    switch (tone) {
      case 'success':
        return '✓';
      case 'warning':
        return '!';
      case 'error':
        return '×';
      default:
        return 'i';
    }
  }

  function showToast(msg, optionsOrUndo = null) {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toastIcon');
    const toastMsg = document.getElementById('toastMsg');
    const toastAction = document.getElementById('toastAction');
    const { undoCallback, tone } = resolveToastOptions(optionsOrUndo);

    if (!toast) return;

    toast.classList.remove('toast-info', 'toast-success', 'toast-warning', 'toast-error');
    toast.classList.add(`toast-${tone}`);
    if (toastIcon) {
      toastIcon.textContent = getToastIconByTone(tone);
    }
    toastMsg.textContent = msg;
    if (undoCallback) {
      toastAction.classList.remove('is-hidden');
      toastAction.onclick = () => {
        undoCallback();
        toast.classList.remove('show');
        if (undoTimeout) clearTimeout(undoTimeout);
      };
    } else {
      toastAction.classList.add('is-hidden');
      toastAction.onclick = null;
    }

    toast.classList.add('show');
    if (undoTimeout) clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 4000);
  }

  function getErrorMessage(error, fallback) {
    if (error && typeof error === 'object' && typeof error.message === 'string' && error.message.trim()) {
      return error.message.trim();
    }
    if (typeof error === 'string' && error.trim()) {
      return error.trim();
    }
    return fallback;
  }

  function runChromeBookmarkMutation(executor) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        const runtimeError = chrome.runtime && chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message || t('popup.tools.cleanFailedReason', null, 'Unknown bookmark error')));
          return;
        }
        resolve();
      };

      try {
        executor(done);
      } catch (error) {
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error || t('popup.tools.cleanFailedReason', null, 'Unknown bookmark error'))));
      }
    });
  }

  function removeBookmarkAsync(bookmarkId) {
    return runChromeBookmarkMutation((done) => chrome.bookmarks.remove(bookmarkId, done));
  }

  function removeBookmarkTreeAsync(folderId) {
    return runChromeBookmarkMutation((done) => chrome.bookmarks.removeTree(folderId, done));
  }

  function getBookmarkRemoveAction(isFolder) {
    return isFolder ? removeBookmarkTreeAsync : removeBookmarkAsync;
  }

  function resetToolCleanupButton(button, idleText) {
    if (!button) return;
    button.disabled = false;
    button.textContent = idleText || t('popup.tools.cleanRunning', null, 'Deleting...');
  }

  function removeRenderedToolItemsByIds(checkboxSelector, successIds) {
    if (!toolsResultList || !Array.isArray(successIds) || successIds.length === 0) return;

    const idSet = new Set(successIds.map((id) => String(id)));
    toolsResultList.querySelectorAll(checkboxSelector).forEach((checkbox) => {
      const itemId = checkbox.getAttribute('data-id');
      if (!itemId || !idSet.has(String(itemId))) return;

      const itemRow = checkbox.closest('.tool-check-item');
      if (!itemRow) return;

      const detailRow = itemRow.nextElementSibling;
      itemRow.remove();
      if (detailRow && detailRow.classList.contains('tool-check-url')) {
        detailRow.remove();
      }
    });
  }

  function setCleanupEmptyState(statusText, resultText, summaryElementId, summaryText) {
    setToolDetailStatusText(statusText, 'success');
    setToolsResultMessage(resultText);
    document.getElementById(summaryElementId).textContent = summaryText;
    toolDetailFooter.style.display = 'none';
    toolDetailFooter.innerHTML = '';
  }

  function updateDuplicateCleanupView(successIds, idleText) {
    removeRenderedToolItemsByIds('.duplicate-checkbox', successIds);

    toolsResultList.querySelectorAll('.tool-check-group').forEach((group) => {
      if (group.querySelectorAll('.duplicate-checkbox').length < 2) {
        group.remove();
      }
    });

    const remainingGroups = toolsResultList.querySelectorAll('.tool-check-group').length;
    if (remainingGroups === 0) {
      setCleanupEmptyState(
        t('popup.tools.duplicatesNone', null, 'Scan complete: no duplicate bookmarks found.'),
        t('popup.tools.cleanLibrary', null, '🎉 Your bookmark library is very clean!'),
        'statusDuplicates',
        t('popup.tools.duplicatesLastStatusZero', null, 'Last scan: 0 duplicates')
      );
      return;
    }

    setToolDetailStatusText(
      t('popup.tools.duplicatesDone', { count: remainingGroups }, `Scan complete: ${remainingGroups} duplicate URL groups found.`),
      'warning',
      true
    );
    document.getElementById('statusDuplicates').textContent = t('popup.tools.duplicatesLastStatus', { count: remainingGroups }, `Last scan: ${remainingGroups} duplicate groups`);

    const activeButton = document.getElementById('btnCleanDuplicates');
    if (activeButton) resetToolCleanupButton(activeButton, idleText);
  }

  function updateBrokenCleanupView(successIds, idleText) {
    removeRenderedToolItemsByIds('.broken-checkbox', successIds);

    toolsResultList.querySelectorAll('.tool-check-group').forEach((group) => {
      if (group.querySelectorAll('.broken-checkbox').length > 0) return;
      const title = group.previousElementSibling;
      group.remove();
      if (title && title.classList.contains('tool-check-group-title')) {
        title.remove();
      }
    });

    const confirmedCount = toolsResultList.querySelectorAll('.tool-check-group:not(.tool-check-group-dashed) .broken-checkbox').length;
    const reviewCount = toolsResultList.querySelectorAll('.tool-check-group-dashed .broken-checkbox').length;

    if (confirmedCount === 0 && reviewCount === 0) {
      setCleanupEmptyState(
        t('popup.tools.brokenAllGood', { count: 0, suffix: '' }, 'Scan complete: all 0 links are reachable. '),
        t('popup.tools.brokenAllGoodResult', null, '🎉 All links look good!'),
        'statusBrokenLinks',
        t('popup.tools.brokenLastStatusClean', null, 'Last scan: no broken links found')
      );
      return;
    }

    if (confirmedCount > 0) {
      setToolDetailStatusText(
        t('popup.tools.brokenDoneMixed', { broken: confirmedCount, uncertain: reviewCount, suffix: '' }, `Scan complete: ${confirmedCount} confirmed broken, ${reviewCount} need review. `),
        'warning',
        true
      );
    } else {
      setToolDetailStatusText(
        t('popup.tools.brokenDoneReviewOnly', { uncertain: reviewCount, suffix: '' }, `Scan complete: no high-confidence broken links found, ${reviewCount} need review. `),
        'warning',
        true
      );
    }
    document.getElementById('statusBrokenLinks').textContent = t('popup.tools.brokenLastStatus', { broken: confirmedCount, uncertain: reviewCount }, `Last scan: ${confirmedCount} confirmed broken / ${reviewCount} review needed`);

    const activeButton = document.getElementById('btnCleanBrokenLinks');
    if (activeButton) resetToolCleanupButton(activeButton, idleText);
  }

  function updateEmptyFolderCleanupView(successIds, idleText) {
    removeRenderedToolItemsByIds('.empty-folder-checkbox', successIds);

    const remainingCount = toolsResultList.querySelectorAll('.empty-folder-checkbox').length;
    if (remainingCount === 0) {
      setCleanupEmptyState(
        t('popup.tools.emptyFoldersNone', null, 'Scan complete: no empty folders found.'),
        t('popup.tools.cleanLibrary', null, '🎉 Your bookmark library is very clean!'),
        'statusEmptyFolders',
        t('popup.tools.emptyFoldersLastStatusZero', null, 'Last scan: 0 empty folders')
      );
      return;
    }

    setToolDetailStatusText(
      t('popup.tools.emptyFoldersDone', { count: remainingCount }, `Scan complete: found ${remainingCount} empty folders.`),
      'warning',
      true
    );
    document.getElementById('statusEmptyFolders').textContent = t('popup.tools.emptyFoldersLastStatus', { count: remainingCount }, `Last scan: ${remainingCount} empty folders`);

    const activeButton = document.getElementById('btnCleanFolders');
    if (activeButton) resetToolCleanupButton(activeButton, idleText);
  }

  async function refreshToolDetailAfterCleanup(options = {}) {
    const {
      successCount = 0,
      failedCount = 0,
      successIds = [],
      afterSuccess
    } = options;

    if (successCount <= 0) return false;

    invalidateBookmarkTreeCache();
    refreshView();

    if (typeof afterSuccess === 'function') {
      try {
        await afterSuccess({ successCount, failedCount, successIds });
        return true;
      } catch (error) {
        console.warn('[Jade] Tool batch cleanup post-refresh failed:', error);
      }
    }

    return false;
  }

  async function runSingleBookmarkDelete(bookmarkId, isFolder) {
    if (!bookmarkId) return;

    showToast(t('popup.tools.cleanRunning', null, 'Deleting...'), { tone: 'info' });

    try {
      await getBookmarkRemoveAction(isFolder)(bookmarkId);
      refreshView();
      showToast(t('popup.toasts.toolCleanDone', { count: 1 }, 'Deleted 1 item'), { tone: 'success' });
    } catch (error) {
      const reason = getErrorMessage(
        error,
        t('popup.tools.cleanFailedReason', null, 'Unknown bookmark error')
      );

      console.warn('[Jade] Single bookmark delete failed:', error);
      showToast(t('popup.toasts.toolCleanFailed', { reason }, `Delete failed: ${reason}`), { tone: 'error' });
    }
  }

  async function runToolBatchCleanup(options) {
    const {
      button,
      ids,
      removeFn,
      idleText,
      afterSuccess
    } = options || {};

    const cleanButton = button || null;
    const selectedIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
    if (!cleanButton || selectedIds.length === 0 || typeof removeFn !== 'function') return;

    cleanButton.className = 'tool-btn tool-btn-danger';
    cleanButton.disabled = true;
    cleanButton.textContent = t('popup.tools.cleanRunning', null, 'Deleting...');
    setToolDetailStatusText(t('popup.tools.scanCleanWorking', null, 'Working: removing selected items...'));

    const results = await Promise.allSettled(selectedIds.map((id) => removeFn(id)));
    const failed = results.filter((result) => result.status === 'rejected');
    const successIds = selectedIds.filter((id, index) => results[index] && results[index].status === 'fulfilled');
    const successCount = selectedIds.length - failed.length;
    const detailRefreshTriggered = await refreshToolDetailAfterCleanup({
      successCount,
      failedCount: failed.length,
      successIds,
      afterSuccess
    });

    if (failed.length === 0) {
      if (!detailRefreshTriggered) {
        setToolDetailStatusText(
          t('popup.tools.cleanDone', { count: successCount }, `Complete: deleted ${successCount} items.`),
          'success'
        );
      }
      showToast(t('popup.toasts.toolCleanDone', { count: successCount }, `Deleted ${successCount} items`), { tone: 'success' });
      if (!detailRefreshTriggered || cleanButton.isConnected) {
        resetToolCleanupButton(cleanButton, idleText);
      }
      return;
    }

    const reason = getErrorMessage(
      failed[0].reason,
      t('popup.tools.cleanFailedReason', null, 'Unknown bookmark error')
    );

    if (successCount > 0) {
      setToolDetailStatusText(
        t(
          'popup.tools.cleanPartial',
          { success: successCount, failed: failed.length, reason },
          `Complete: deleted ${successCount} items, ${failed.length} failed (${reason}).`
        ),
        'warning',
        true
      );
      showToast(
        t(
          'popup.toasts.toolCleanPartial',
          { success: successCount, failed: failed.length },
          `Deleted ${successCount} items, ${failed.length} failed`
        ),
        { tone: 'warning' }
      );
    } else {
      setToolDetailStatusText(
        t('popup.tools.cleanFailed', { reason }, `Delete failed: ${reason}`),
        'error',
        true
      );
      showToast(t('popup.toasts.toolCleanFailed', { reason }, `Delete failed: ${reason}`), { tone: 'error' });
    }

    console.warn('[Jade] Tool batch cleanup failed:', failed.map((item) => item.reason));
    if (!detailRefreshTriggered || cleanButton.isConnected) {
      resetToolCleanupButton(cleanButton, idleText);
    }
  }

  function removeFromPinnedWithUndo(id, oldIndex) {
    const orderBefore = Array.from(pinnedIds);
    const frequentOrderBefore = [...frequentOrder];

    pinnedIds.delete(id);
    savePinnedPreferences({ pinned_bookmarks: Array.from(pinnedIds) }, () => {
      if (navigationStack.length <= 1) buildDashboard();
      else refreshView();
      showToast(t('popup.toasts.removedFromPinned', null, 'Removed from Pinned'), { undoCallback: () => {
        // undo
        pinnedIds = new Set(orderBefore);
        frequentOrder = frequentOrderBefore;
        savePinnedPreferences({
          pinned_bookmarks: Array.from(pinnedIds),
          frequent_order: frequentOrder
        }, () => {
          if (navigationStack.length <= 1) buildDashboard();
          else refreshView();
        });
      }, tone: 'info' });
    });
  }

  // --- 右键菜单与模态框处理 ---
  function showContextMenu(e, isFolder, isFrequent = false, isRecent = false) {
    const visibility = contextMenuModule && contextMenuModule.resolveVisibility
      ? contextMenuModule.resolveVisibility({
        isFolder,
        isFrequent,
        isRecent,
        targetNodePinKey,
        targetNodeId,
        targetNodeDomain,
        pinnedIds
      })
      : {
        showPin: !isRecent,
        pinText: pinnedIds.has(targetNodePinKey || targetNodeId || targetNodeDomain)
          ? t('popup.contextMenu.removeFromPinned', null, 'Remove from Pinned')
          : t('popup.contextMenu.addToPinned', null, 'Add to Pinned'),
        showSortName: isFolder && !isRecent,
        showSortTime: isFolder && !isRecent,
        showEdit: (targetNodeId || isFrequent) && !isRecent,
        showDelete: !!(targetNodeId && !isRecent),
        showAddToGroup: isRecent,
        showRemoveRecent: isRecent,
        showDivider: !isRecent
      };

    if (menuPin) {
      menuPin.style.display = visibility.showPin ? 'block' : 'none';
      menuPin.textContent = visibility.pinText;
    }
    if (menuSortName) menuSortName.style.display = visibility.showSortName ? 'block' : 'none';
    if (menuSortTime) menuSortTime.style.display = visibility.showSortTime ? 'block' : 'none';
    if (menuEdit) menuEdit.style.display = visibility.showEdit ? 'block' : 'none';
    if (menuDelete) menuDelete.style.display = visibility.showDelete ? 'block' : 'none';
    if (menuAddToGroup) menuAddToGroup.style.display = visibility.showAddToGroup ? 'block' : 'none';
    if (menuRemoveRecent) menuRemoveRecent.style.display = visibility.showRemoveRecent ? 'block' : 'none';
    if (menuDivider1) menuDivider1.style.display = visibility.showDivider ? 'block' : 'none';

    const pos = contextMenuModule && contextMenuModule.resolvePosition
      ? contextMenuModule.resolvePosition({
        clientX: e.clientX,
        clientY: e.clientY,
        bodyWidth: document.body.clientWidth,
        bodyHeight: document.body.clientHeight,
        isFolder,
        isFrequent
      })
      : { x: e.clientX, y: e.clientY };

    contextMenu.style.left = `${pos.x}px`;
    contextMenu.style.top = `${pos.y}px`;
    contextMenu.style.display = 'block';
  }

  function setupContextMenuAndModals() {
    if (menuAddToGroup) {
      menuAddToGroup.addEventListener('click', () => {
        // TODO: 接入项目已有的“添加到分组”能力。这里预留调用接口
        showToast(t('popup.toasts.featureInProgress', null, 'In progress: add to group support'), { tone: 'warning' });
        contextMenu.style.display = 'none';
      });
    }

    if (menuRemoveRecent) {
      menuRemoveRecent.addEventListener('click', () => {
        const activeUrl = targetNodeDomain; // recently saved url
        if (!activeUrl) return;

        if (!hiddenRecentUrls.includes(activeUrl)) {
          hiddenRecentUrls.push(activeUrl);
          chrome.storage.local.set({ hidden_recent_urls: hiddenRecentUrls }, () => {
            buildRecents();
            showToast(t('popup.toasts.removedFromRecent', null, 'Removed from Recent'), { undoCallback: () => {
              // 撤销逻辑
              hiddenRecentUrls = hiddenRecentUrls.filter(u => u !== activeUrl);
              chrome.storage.local.set({ hidden_recent_urls: hiddenRecentUrls }, () => {
                buildRecents();
              });
            }, tone: 'info' });
          });
        }
        contextMenu.style.display = 'none';
      });
    }

    menuPin.addEventListener('click', () => {
      const activeId = targetNodePinKey || targetNodeId || targetNodeDomain;
      if (!activeId) return;

      if (pinnedIds.has(activeId)) {
        removeFromPinnedWithUndo(activeId, -1);
      } else {
        if (pinnedIds.size >= 8) {
          showToast(t('popup.toasts.maxPinned', null, 'Pinned supports up to 8 sites'), { tone: 'warning' });
          return;
        }
        pinnedIds.add(activeId);
        savePinnedPreferences({ pinned_bookmarks: Array.from(pinnedIds) }, () => {
          if (navigationStack.length <= 1) buildDashboard();
          else refreshView();
          showToast(t('popup.toasts.addedToPinned', null, 'Added to Pinned'), { tone: 'success' });
        });
      }
    });

    menuSortName.addEventListener('click', () => {
      if (targetNodeId && targetNodeIsFolder) sortChildren(targetNodeId, 'name');
    });

    menuSortTime.addEventListener('click', () => {
      if (targetNodeId && targetNodeIsFolder) sortChildren(targetNodeId, 'time');
    });

    menuEdit.addEventListener('click', () => {
      if (targetNodeId) {
        // 书签项：直接编辑书签
        chrome.bookmarks.get(targetNodeId, (nodes) => {
          const node = nodes[0];
          editModalTitle.textContent = targetNodeIsFolder
            ? t('popup.edit.titleFolder', null, 'Edit Folder')
            : t('popup.edit.titleBookmark', null, 'Edit Bookmark');
          editTitleInput.value = node.title || '';
          if (targetNodeIsFolder) {
            if (editUrlGroup) editUrlGroup.style.display = 'none';
            editUrlInput.value = '';
          } else {
            if (editUrlGroup) editUrlGroup.style.display = 'block';
            editUrlInput.value = node.url || '';
          }
          editModal.style.display = 'flex';
          editTitleInput.focus();
        });
      } else if (targetNodeDomain) {
        // 历史记录项：编辑自定义显示名称和网址
        const frequentKey = targetFrequentKey || targetNodePinKey || targetNodeDomain;
        editModalTitle.textContent = t('popup.edit.titleFrequent', null, 'Edit Frequent Site');
        editTitleInput.value = frequentCustomTitles[frequentKey] || frequentCustomTitles[targetNodeDomain] || targetNodeDomain;
        if (editUrlGroup) editUrlGroup.style.display = 'block';
        editUrlInput.value = frequentCustomUrls[frequentKey] || frequentCustomUrls[targetNodeDomain] || targetFrequentUrl || '';
        editModal.style.display = 'flex';
        editTitleInput.focus();
      }
    });

    menuDelete.addEventListener('click', async () => {
      if (!targetNodeId) return;
      const confirmMessage = targetNodeIsFolder
        ? t('popup.confirm.deleteFolder', null, 'Delete this folder and all of its children?')
        : t('popup.confirm.deleteBookmark', null, 'Delete this bookmark?');
      if (!(await confirmDangerAction(confirmMessage, { okText: t('common.delete', null, 'Delete') }))) return;
      await runSingleBookmarkDelete(targetNodeId, targetNodeIsFolder);
    });

    // Edit modal actions
    editCancelBtn.addEventListener('click', () => {
      editModal.style.display = 'none';
    });

    editSaveBtn.addEventListener('click', () => {
      const title = editTitleInput.value.trim();
      if (!title) return;

      if (targetNodeId) {
        // 书签项：更新书签
        const updates = { title };
        if (!targetNodeIsFolder) {
          updates.url = editUrlInput.value;
        }
        chrome.bookmarks.update(targetNodeId, updates, () => {
          editModal.style.display = 'none';
          refreshView();
        });
      } else if (targetNodeDomain) {
        // 历史记录项：保存自定义标题和 URL
        const frequentKey = targetFrequentKey || targetNodePinKey || targetNodeDomain;
        frequentCustomTitles[frequentKey] = title;
        if (frequentKey !== targetNodeDomain) {
          delete frequentCustomTitles[targetNodeDomain];
        }
        const customUrl = editUrlInput.value.trim();
        if (customUrl) {
          frequentCustomUrls[frequentKey] = customUrl;
        } else {
          delete frequentCustomUrls[frequentKey];
        }
        if (frequentKey !== targetNodeDomain) {
          delete frequentCustomUrls[targetNodeDomain];
        }
        saveCustomPreferences({
          frequent_custom_titles: frequentCustomTitles,
          frequent_custom_urls: frequentCustomUrls
        }, () => {
          editModal.style.display = 'none';
          buildDashboard();
        });
      }
    });
  }

  function refreshView() {
    invalidateBookmarkTreeCache();
    if (navigationStack.length <= 1) buildDashboard();
    else loadStandardFolder(currentFolderId);
  }

  function sortChildren(folderId, type) {
    chrome.bookmarks.getChildren(folderId, (children) => {
      let sorted = [...children];
      if (type === 'name') {
        sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      } else if (type === 'time') {
        sorted.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
      }

      let p = Promise.resolve();
      sorted.forEach((child, i) => {
        p = p.then(() => new Promise(res => {
          chrome.bookmarks.move(child.id, { parentId: folderId, index: i }, res);
        }));
      });
      p.then(refreshView);
    });
  }

  // --- 工具箱逻辑 (下钻视图导航) ---
  const toolDetailStatus = document.getElementById('toolDetailStatus');
  const toolDetailMainAction = document.getElementById('toolDetailMainAction');
  const toolDetailWarning = document.getElementById('toolDetailWarning');
  const toolDetailFooter = document.getElementById('toolDetailFooter');
  const toolboxViewController = toolboxViewModule && toolboxViewModule.createToolboxViewController
    ? toolboxViewModule.createToolboxViewController({
      t,
      toolsTitle,
      toolsBackBtn,
      toolsMenuView,
      toolsDetailView,
      toolsResultList,
      toolDetailStatus,
      toolDetailMainAction,
      toolDetailWarning,
      toolDetailFooter,
      cancelBrokenLinkScanSilently
    })
    : null;

  function openToolView(titleStr) {
    if (!toolboxViewController) return;
    toolboxViewController.openToolView(titleStr);
  }

  function closeToolView() {
    if (!toolboxViewController) return;
    toolboxViewController.closeToolView();
  }

  function runDuplicateScan(scanButton, options = {}) {
    const btn = scanButton || document.getElementById('btnStartFindDuplicates');
    if (!btn) return;

    const { forceRefresh = false } = options;

    btn.className = 'tool-btn tool-btn-primary';
    btn.disabled = true;
    btn.textContent = t('popup.tools.statusRunning', null, 'Working...');
    toolDetailStatus.style.display = 'flex';
    setToolDetailStatusText(t('popup.tools.duplicatesScanning', null, 'Running: scanning the full bookmark library...'));
    toolDetailFooter.style.display = 'none';
    toolDetailFooter.style.justifyContent = '';
    toolDetailFooter.innerHTML = '';
    setToolsResultMessage(t('popup.tools.statusRunning', null, 'Working...'));

    getBookmarkTreeCached((tree) => {
      const urlMap = new Map();
      function traverse(nodes) {
        nodes.forEach(node => {
          if (node.url) {
            const u = node.url.trim();
            if (u) {
              if (!urlMap.has(u)) urlMap.set(u, []);
              urlMap.get(u).push(node);
            }
          }
          if (node.children) traverse(node.children);
        });
      }
      traverse(tree);

      const duplicateGroups = [];
      urlMap.forEach((nodes, url) => {
        if (nodes.length > 1) duplicateGroups.push({ url, nodes });
      });

      if (duplicateGroups.length === 0) {
        setToolDetailStatusText(t('popup.tools.duplicatesNone', null, 'Scan complete: no duplicate bookmarks found.'), 'success');
        setToolsResultMessage(t('popup.tools.cleanLibrary', null, '🎉 Your bookmark library is very clean!'));
        document.getElementById('statusDuplicates').textContent = t('popup.tools.duplicatesLastStatusZero', null, 'Last scan: 0 duplicates');
        toolDetailFooter.style.display = 'none';
        toolDetailFooter.innerHTML = '';
        btn.disabled = false;
        btn.textContent = t('popup.tools.duplicatesRescan', null, 'Scan Again');
        btn.className = 'tool-btn tool-btn-secondary';
        return;
      }

      setToolDetailStatusText(t('popup.tools.duplicatesDone', { count: duplicateGroups.length }, `Scan complete: ${duplicateGroups.length} duplicate URL groups found.`), 'warning', true);
      document.getElementById('statusDuplicates').textContent = t('popup.tools.duplicatesLastStatus', { count: duplicateGroups.length }, `Last scan: ${duplicateGroups.length} duplicate groups`);

      let html = '';
      duplicateGroups.forEach(group => {
        html += `<div class="tool-check-group">
                                    <div class="tool-check-url">${escapeHtml(group.url)}</div>`;
        group.nodes.forEach((node, nIdx) => {
          const shouldCheck = nIdx > 0;
          html += `<div class="tool-check-item">
                                        <input type="checkbox" class="duplicate-checkbox" data-id="${node.id}" ${shouldCheck ? 'checked' : ''}>
                                        <span class="tool-check-label" title="${escapeHtml(node.title)}">${escapeHtml(node.title || t('common.untitled', null, 'Untitled'))}</span>
                                       </div>`;
        });
        html += `</div>`;
      });

      toolDetailFooter.style.display = 'flex';
      toolDetailFooter.innerHTML = `<button id="btnCleanDuplicates" class="tool-btn tool-btn-danger">${escapeHtml(t('popup.tools.duplicatesClean', null, 'Delete Selected'))}</button>`;
      toolsResultList.innerHTML = html;
      btn.disabled = false;
      btn.textContent = t('popup.tools.duplicatesRescan', null, 'Scan Again');
      btn.className = 'tool-btn tool-btn-secondary';

      document.getElementById('btnCleanDuplicates').addEventListener('click', async (eClean) => {
        const checkboxes = toolsResultList.querySelectorAll('.duplicate-checkbox:checked');
        if (checkboxes.length === 0) return;
        const cleanButton = eClean.currentTarget;
        if (!(await confirmDangerAction(
          t('popup.tools.duplicatesConfirm', { count: checkboxes.length }, `Delete the selected ${checkboxes.length} duplicate bookmarks?`),
          { okText: t('common.delete', null, 'Delete') }
        ))) return;
        await runToolBatchCleanup({
          button: cleanButton,
          ids: Array.from(checkboxes).map((cb) => cb.getAttribute('data-id')),
          removeFn: removeBookmarkAsync,
          idleText: t('popup.tools.duplicatesClean', null, 'Delete Selected'),
          afterSuccess: async ({ successIds }) => {
            updateDuplicateCleanupView(successIds, t('popup.tools.duplicatesClean', null, 'Delete Selected'));
          }
        });
      });
    }, { forceRefresh });
  }

  function setupToolsListeners() {
    importFileInput.addEventListener('change', handleImport);

    if (urlReplaceToolModule && urlReplaceToolModule.bindUrlReplaceTool) {
      urlReplaceToolModule.bindUrlReplaceTool({
        chromeApi: chrome,
        t,
        escapeHtml,
        escapeHtmlAttr,
        btnBatchReplaceUrl,
        toolDetailMainAction,
        toolDetailStatus,
        toolDetailWarning,
        toolDetailFooter,
        toolsResultList,
        getBookmarkTreeCached,
        confirmDangerAction,
        refreshView,
        openToolView,
        closeToolView
      });
    }

    // 0. 导入书签
    if (btnImportBookmarksNew) {
      btnImportBookmarksNew.addEventListener('click', () => {
        openToolView(t('popup.tools.importTitle', null, 'Import Bookmarks'));
        toolDetailStatus.style.display = 'flex';
        setToolDetailStatusText(t('popup.tools.importWaiting', null, 'Status: waiting for file selection'));

        toolDetailMainAction.innerHTML = `<button id="btnSelectImportFile" class="tool-btn tool-btn-primary">${escapeHtml(t('popup.tools.importSelectFile', null, 'Select File'))}</button>`;
        toolDetailWarning.style.display = 'block';
        toolDetailWarning.innerHTML = t('popup.tools.importWarning', null, '⚠️ Import creates a new folder under Other Bookmarks and writes imported entries there. Standard HTML bookmark files (Netscape format) are supported.');

        document.getElementById('btnSelectImportFile').addEventListener('click', () => {
          importFileInput.click();
        });
      });
    }

    // 0.1 导出书签
    if (btnExportBookmarksNew) {
      btnExportBookmarksNew.addEventListener('click', () => {
        openToolView(t('popup.tools.exportTitle', null, 'Export Bookmarks'));
        toolDetailStatus.style.display = 'flex';
        setToolDetailStatusText(t('popup.tools.exportReady', null, 'Status: ready to export'));

        toolDetailMainAction.innerHTML = `<button id="btnExecuteExport" class="tool-btn tool-btn-primary">${escapeHtml(t('popup.tools.exportNow', null, 'Export Now'))}</button>`;
        toolDetailWarning.style.display = 'block';
        toolDetailWarning.innerHTML = t('popup.tools.exportWarning', null, '💡 Export backs up your full bookmark tree as a standard HTML file that can be restored in another browser.');

        document.getElementById('btnExecuteExport').addEventListener('click', (e) => {
          e.target.className = 'tool-btn tool-btn-primary';
          e.target.disabled = true;
          e.target.textContent = t('popup.tools.statusRunning', null, 'Working...');
          setToolDetailStatusText(t('popup.tools.exportGenerating', null, 'Status: generating export...'));
          handleExportBookmarks(e.target);
        });
      });
    }

    // 1. 扫描重复书签
    if (btnFindDuplicates) {
      btnFindDuplicates.addEventListener('click', () => {
        openToolView(t('popup.tools.duplicatesTitle', null, 'Find Duplicates'));
        toolDetailStatus.style.display = 'flex';
        setToolDetailStatusText(t('popup.tools.duplicatesIdle', null, 'Status: not scanned yet'));

        toolDetailMainAction.innerHTML = `<button id="btnStartFindDuplicates" class="tool-btn tool-btn-primary">${escapeHtml(t('popup.tools.duplicatesStart', null, 'Start Scan'))}</button>`;
        toolDetailWarning.style.display = 'block';
        toolDetailWarning.innerHTML = t('popup.tools.duplicatesWarning', null, '💡 Duplicates are detected by exact URL match. Bulk cleanup cannot be undone.');

        document.getElementById('btnStartFindDuplicates').addEventListener('click', (e) => {
          runDuplicateScan(e.currentTarget);
        });
      });
    }

    // 2. 统计报告
    if (btnBookmarkStats) {
      btnBookmarkStats.addEventListener('click', () => {
        openToolView(t('popup.tools.statsTitle', null, 'Bookmark Stats'));
        toolDetailStatus.style.display = 'flex';
        setToolDetailStatusText(t('popup.tools.statsIdle', null, 'Status: not analyzed yet'));

        toolDetailMainAction.innerHTML = `<button id="btnStartStats" class="tool-btn tool-btn-primary">${escapeHtml(t('popup.tools.statsStart', null, 'Analyze'))}</button>`;
        toolDetailWarning.style.display = 'block';
        toolDetailWarning.innerHTML = t('popup.tools.statsWarning', null, '💡 Generates a local structural and health report for your bookmark library, including top domains.');

        document.getElementById('btnStartStats').addEventListener('click', (e) => {
          const btn = e.target;
          btn.className = 'tool-btn tool-btn-primary';
          btn.disabled = true;
          btn.textContent = t('popup.tools.statusRunning', null, 'Working...');
          setToolDetailStatusText(t('popup.tools.statsCollecting', null, 'Running: collecting data...'));

          getBookmarkTreeCached((tree) => {
            let totalBookmarks = 0;
            let totalFolders = 0;
            let maxDepth = 0;
            let emptyFolders = 0;
            let httpsCount = 0;
            let httpCount = 0;
            let otherProtocolCount = 0;
            let untitledItems = 0;
            let rootLevelBookmarks = 0;
            const domainMap = new Map();
            const urlSet = new Map(); // url -> count
            let largestFolder = { title: '-', count: 0 };

            function traverse(nodes, depth, parentId = null) {
              nodes.forEach(node => {
                const title = typeof node.title === 'string' ? node.title.trim() : '';
                const isBookmark = Boolean(node.url);

                if (!title && node.id !== '0') {
                  untitledItems++;
                }

                if (isBookmark) {
                  totalBookmarks++;
                  if (parentId === '0' || parentId === '1' || parentId === '2') {
                    rootLevelBookmarks++;
                  }
                  // 域名统计
                  try {
                    const parsedUrl = new URL(node.url);
                    const hostname = parsedUrl.hostname;
                    if (hostname) {
                      domainMap.set(hostname, (domainMap.get(hostname) || 0) + 1);
                    }
                    if (parsedUrl.protocol === 'https:') httpsCount++;
                    else if (parsedUrl.protocol === 'http:') httpCount++;
                    else otherProtocolCount++;
                  } catch (_) { /* 忽略非法 URL */ }
                  // 重复 URL 统计
                  const u = node.url.trim();
                  if (u) urlSet.set(u, (urlSet.get(u) || 0) + 1);
                } else if (node.children) {
                  totalFolders++;
                  if (depth > maxDepth) maxDepth = depth;
                  if (node.children.length === 0 && node.id !== '0' && node.id !== '1' && node.id !== '2') {
                    emptyFolders++;
                  }
                  // 最大文件夹
                  const directChildren = node.children.length;
                  if (directChildren > largestFolder.count && node.id !== '0') {
                    largestFolder = { title: node.title || t('common.untitled', null, 'Untitled'), count: directChildren };
                  }
                  traverse(node.children, depth + 1, node.id);
                }
              });
            }
            traverse(tree, 1, null);

            // 重复链接数
            let duplicateCount = 0;
            urlSet.forEach((count) => { if (count > 1) duplicateCount++; });

            const uniqueDomains = domainMap.size;
            const uniqueUrls = urlSet.size;
            const averageBookmarksPerFolder = totalFolders > 0 ? (totalBookmarks / totalFolders).toFixed(1) : '0.0';
            const safeBookmarkCount = Math.max(totalBookmarks, 1);

            // 域名 Top 10
            const sortedDomains = [...domainMap.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10);
            const topCount = sortedDomains.length > 0 ? sortedDomains[0][1] : 1;

            const linkDistributionRows = [
              {
                label: t('popup.tools.statsHttpsLinks', null, 'HTTPS Links'),
                count: httpsCount,
                toneClass: 'stats-health-good'
              },
              {
                label: t('popup.tools.statsHttpLinks', null, 'HTTP Links'),
                count: httpCount,
                toneClass: httpCount > 0 ? 'stats-health-warning' : 'stats-health-good'
              },
              {
                label: t('popup.tools.statsOtherProtocols', null, 'Other Protocols'),
                count: otherProtocolCount,
                toneClass: otherProtocolCount > 0 ? 'stats-health-primary' : 'stats-health-good'
              },
              {
                label: t('popup.tools.statsRootLevelBookmarks', null, 'Root-Level Bookmarks'),
                count: rootLevelBookmarks,
                toneClass: rootLevelBookmarks > 0 ? 'stats-health-warning' : 'stats-health-good'
              }
            ].map(({ label, count, toneClass }) => {
              const percent = Math.round((count / safeBookmarkCount) * 100);
              const valueText = count > 0
                ? t('popup.tools.statsCountWithPercent', { count, percent }, `${count} items (${percent}%)`)
                : t('popup.tools.statsNone', null, 'None');
              return `
                <div class="stats-health-row">
                  <span class="stats-health-label">${escapeHtml(label)}</span>
                  <span class="stats-health-value ${toneClass}">${escapeHtml(valueText)}</span>
                </div>
              `;
            }).join('');

            const largestFolderText = largestFolder.count > 0
              ? `${escapeHtml(largestFolder.title)} (${escapeHtml(t('popup.tools.statsItems', { count: largestFolder.count }, `${largestFolder.count} items`))})`
              : escapeHtml(t('popup.tools.statsNone', null, 'None'));

            let domainHtml = '';
            sortedDomains.forEach(([domain, count], idx) => {
              const pct = Math.round((count / topCount) * 100);
              domainHtml += `
                <div class="stats-domain-row">
                  <span class="stats-domain-rank">${idx + 1}</span>
                  <div class="stats-domain-main">
                    <span class="stats-domain-name">${escapeHtml(domain)}</span>
                    <div class="stats-domain-bar">
                      <div class="stats-domain-fill" data-fill="${pct}"></div>
                    </div>
                  </div>
                  <span class="stats-domain-count">${count}</span>
                </div>`;
            });

            setToolDetailStatusText(t('popup.tools.statsDone', null, 'Analysis complete'), 'success');
            toolsResultList.innerHTML = `
              <div class="stats-card-grid stats-card-grid-tight">
                <div class="stat-card stat-card-compact">
                  <div class="stat-value stat-value-medium">${totalBookmarks}</div>
                  <div class="stat-label">${escapeHtml(t('popup.tools.statsTotalBookmarks', null, 'Bookmarks'))}</div>
                </div>
                <div class="stat-card stat-card-compact">
                  <div class="stat-value stat-value-medium">${totalFolders}</div>
                  <div class="stat-label">${escapeHtml(t('popup.tools.statsTotalFolders', null, 'Folders'))}</div>
                </div>
                <div class="stat-card stat-card-compact">
                  <div class="stat-value stat-value-medium">${uniqueDomains}</div>
                  <div class="stat-label">${escapeHtml(t('popup.tools.statsUniqueDomains', null, 'Unique Domains'))}</div>
                </div>
                <div class="stat-card stat-card-compact">
                  <div class="stat-value stat-value-medium">${uniqueUrls}</div>
                  <div class="stat-label">${escapeHtml(t('popup.tools.statsUniqueUrls', null, 'Unique URLs'))}</div>
                </div>
                <div class="stat-card stat-card-compact">
                  <div class="stat-value stat-value-medium">${maxDepth}</div>
                  <div class="stat-label">${escapeHtml(t('popup.tools.statsMaxDepth', null, 'Max Depth'))}</div>
                </div>
                <div class="stat-card stat-card-compact">
                  <div class="stat-value stat-value-medium ${emptyFolders > 0 ? 'stat-value-warning' : ''}">${emptyFolders}</div>
                  <div class="stat-label">${escapeHtml(t('popup.tools.statsEmptyFolders', null, 'Empty Folders'))}</div>
                </div>
              </div>

              <div class="stats-section">
                <div class="stats-section-title">${escapeHtml(t('popup.tools.statsTopDomains', null, 'Top 10 Domains'))}</div>
                <div class="stats-section-panel stats-domain-list">
                  ${domainHtml || `<div class="stats-empty">${escapeHtml(t('common.noData', null, 'No data'))}</div>`}
                </div>
              </div>

              <div class="stats-section">
                <div class="stats-section-title">${escapeHtml(t('popup.tools.statsLinkDistribution', null, 'Link Distribution'))}</div>
                <div class="stats-section-panel stats-health-list">
                  ${linkDistributionRows}
                </div>
              </div>

              <div class="stats-section">
                <div class="stats-section-title">${escapeHtml(t('popup.tools.statsStructureHealth', null, 'Structure Health'))}</div>
                <div class="stats-section-panel stats-health-list">
                  <div class="stats-health-row">
                    <span class="stats-health-label">${escapeHtml(t('popup.tools.statsDuplicateLinks', null, 'Duplicate Links'))}</span>
                    <span class="stats-health-value ${duplicateCount > 0 ? 'stats-health-warning' : 'stats-health-good'}">${duplicateCount > 0 ? escapeHtml(t('popup.tools.statsGroups', { count: duplicateCount }, `${duplicateCount} groups`)) : escapeHtml(t('popup.tools.statsNone', null, 'None'))}</span>
                  </div>
                  <div class="stats-health-row">
                    <span class="stats-health-label">${escapeHtml(t('popup.tools.statsEmptyFolders', null, 'Empty Folders'))}</span>
                    <span class="stats-health-value ${emptyFolders > 0 ? 'stats-health-warning' : 'stats-health-good'}">${emptyFolders > 0 ? escapeHtml(t('popup.tools.statsItems', { count: emptyFolders }, `${emptyFolders} items`)) : escapeHtml(t('popup.tools.statsNone', null, 'None'))}</span>
                  </div>
                  <div class="stats-health-row">
                    <span class="stats-health-label">${escapeHtml(t('popup.tools.statsUntitledItems', null, 'Untitled Items'))}</span>
                    <span class="stats-health-value ${untitledItems > 0 ? 'stats-health-warning' : 'stats-health-good'}">${untitledItems > 0 ? escapeHtml(t('popup.tools.statsItems', { count: untitledItems }, `${untitledItems} items`)) : escapeHtml(t('popup.tools.statsNone', null, 'None'))}</span>
                  </div>
                  <div class="stats-health-row">
                    <span class="stats-health-label">${escapeHtml(t('popup.tools.statsAvgPerFolder', null, 'Avg Bookmarks per Folder'))}</span>
                    <span class="stats-health-value stats-health-primary">${escapeHtml(t('popup.tools.statsAvgValue', { value: averageBookmarksPerFolder }, `${averageBookmarksPerFolder} / folder`))}</span>
                  </div>
                  <div class="stats-health-row">
                    <span class="stats-health-label">${escapeHtml(t('popup.tools.statsLargestFolder', null, 'Largest Folder'))}</span>
                    <span class="stats-health-value stats-health-primary">${largestFolderText}</span>
                  </div>
                </div>
              </div>
            `;
            toolsResultList.querySelectorAll('.stats-domain-fill').forEach((el) => {
              const pct = Math.max(0, Math.min(100, Number(el.dataset.fill || 0)));
              el.style.width = `${pct}%`;
            });
            document.getElementById('statusStats').textContent = t('popup.tools.statsCountLabel', { count: totalBookmarks }, `${totalBookmarks} bookmarks total`);
            btn.disabled = false;
            btn.textContent = t('popup.tools.statsReanalyze', null, 'Analyze Again');
          });
        });
      });
    }

    if (btnFindBrokenLinks) {
      btnFindBrokenLinks.addEventListener('click', () => {
        openToolView(t('popup.tools.brokenTitle', null, 'Check Broken Links'));
        toolDetailStatus.style.display = 'flex';
        setToolDetailStatusText(t('popup.tools.brokenIdle', null, 'Status: not scanned yet'));
        toolDetailMainAction.innerHTML = `<button id="btnStartCheckBroken" class="tool-btn tool-btn-primary">${escapeHtml(t('popup.tools.brokenStart', null, 'Start Check'))}</button>`;
        toolDetailWarning.style.display = 'block';
        toolDetailWarning.innerHTML = t('popup.tools.brokenWarning', null, '⚠️ Strategy: probe with HEAD first, retry by confidence level, and mark uncertain links for manual review to avoid false deletes.');

        document.getElementById('btnStartCheckBroken').addEventListener('click', async (e) => {
          const btn = e.target;
          btn.className = 'tool-btn tool-btn-primary';
          btn.disabled = true;
          btn.textContent = t('popup.tools.statusRunning', null, 'Working...');
          toolDetailStatus.style.display = 'flex';
          setToolDetailStatusText(t('popup.tools.brokenCollecting', null, 'Running: collecting all links...'));
          setToolsResultMessage(t('popup.tools.statusRunning', null, 'Working...'));

          if (!toolsModule || !toolsModule.runBrokenLinkScan || !toolsModule.collectHttpLinks) {
            setToolDetailStatusText(t('popup.tools.brokenModuleMissing', null, 'Status: tools module is unavailable, cannot run detection'), 'error');
            setToolsResultMessage(t('popup.tools.brokenModuleMissingResult', null, 'Reload the extension and try again'), 'error');
            btn.disabled = false;
            btn.textContent = t('popup.tools.brokenRetry', null, 'Check Again');
            btn.className = 'tool-btn tool-btn-secondary';
            return;
          }

          if (brokenLinkScanSession && !brokenLinkScanSession.cancelled) {
            if (toolsModule.cancelScan) toolsModule.cancelScan(brokenLinkScanSession);
            else {
              brokenLinkScanSession.cancelled = true;
              brokenLinkScanSession.controllers.forEach(controller => controller.abort());
              brokenLinkScanSession.controllers.clear();
            }
          }

          const scanSession = toolsModule.createScanSession
            ? toolsModule.createScanSession()
            : { cancelled: false, controllers: new Set() };
          brokenLinkScanSession = scanSession;

          const setScanIdle = () => {
            btn.disabled = false;
            btn.textContent = t('popup.tools.brokenRetry', null, 'Check Again');
            btn.className = 'tool-btn tool-btn-secondary';
          };

          getBookmarkTreeCached(async (tree) => {
            const links = toolsModule.collectHttpLinks(tree);
            let completedCount = 0;
            const totalCount = links.length;

            if (totalCount === 0) {
              setToolDetailStatusText(t('popup.tools.brokenNoHttp', null, 'Scan complete: no valid HTTP(S) links found to inspect.'), 'success');
              toolsResultList.innerHTML = '';
              toolDetailFooter.style.display = 'none';
              setScanIdle();
              if (brokenLinkScanSession === scanSession) brokenLinkScanSession = null;
              return;
            }

            setToolDetailStatusText(t('popup.tools.brokenPreparing', { count: totalCount }, `Running: found ${totalCount} links, preparing probes. This may take about a minute.`));
            toolsResultList.innerHTML = '';
            toolDetailFooter.style.display = 'flex';
            toolDetailFooter.style.justifyContent = 'center';
            toolDetailFooter.innerHTML = `<button id="btnCancelBrokenScan" class="tool-btn tool-btn-secondary">${escapeHtml(t('popup.tools.brokenCancel', null, 'Cancel Check'))}</button>`;
            const cancelBtn = document.getElementById('btnCancelBrokenScan');
            if (cancelBtn) {
              cancelBtn.addEventListener('click', () => {
                if (scanSession.cancelled) return;
                if (toolsModule.cancelScan) toolsModule.cancelScan(scanSession);
                else {
                  scanSession.cancelled = true;
                  scanSession.controllers.forEach(controller => controller.abort());
                  scanSession.controllers.clear();
                }
                setToolDetailStatusText(t('popup.tools.brokenCancelled', { completed: completedCount, total: totalCount }, `Check cancelled (${completedCount}/${totalCount})`), 'warning');
                setToolsResultMessage(t('popup.tools.brokenCancelledResult', null, 'This check was cancelled'));
                toolDetailFooter.style.display = 'none';
                setScanIdle();
                if (brokenLinkScanSession === scanSession) brokenLinkScanSession = null;
              });
            }

            const scanResult = await toolsModule.runBrokenLinkScan(links, scanSession, {
              concurrency: 4,
              cache: deadLinkProbeCache,
              cacheTtlMs: DEAD_LINK_CACHE_TTL_MS,
              onProgress: (completed, total) => {
                completedCount = completed;
                if (completed % 10 === 0 || completed === total) {
                  setToolDetailStatusText(t('popup.tools.brokenProgress', { completed, total }, `Running: probing ${completed}/${total}...`));
                }
              }
            });
            schedulePersistDeadLinkProbeCache();

            if (scanSession.cancelled) {
              if (brokenLinkScanSession === scanSession) brokenLinkScanSession = null;
              return;
            }

            const brokenLinks = scanResult.brokenLinks || [];
            const uncertainLinks = scanResult.uncertainLinks || [];
            const cacheHits = scanResult.cacheHits || 0;

            if (brokenLinks.length === 0 && uncertainLinks.length === 0) {
              const suffix = cacheHits > 0
                ? t('popup.tools.brokenCacheSuffix', { count: cacheHits }, `(reused ${cacheHits} cached results)`)
                : '';
              setToolDetailStatusText(t('popup.tools.brokenAllGood', { count: totalCount, suffix }, `Scan complete: all ${totalCount} links are reachable. ${suffix}`), 'success');
              setToolsResultMessage(t('popup.tools.brokenAllGoodResult', null, '🎉 All links look good!'));
              document.getElementById('statusBrokenLinks').textContent = t('popup.tools.brokenLastStatusClean', null, 'Last scan: no broken links found');
              toolDetailFooter.style.display = 'none';
              setScanIdle();
              if (brokenLinkScanSession === scanSession) brokenLinkScanSession = null;
              return;
            }

            if (brokenLinks.length > 0) {
              const suffix = cacheHits > 0
                ? t('popup.tools.brokenCacheSuffix', { count: cacheHits }, `(reused ${cacheHits} cached results)`)
                : '';
              setToolDetailStatusText(t('popup.tools.brokenDoneMixed', { broken: brokenLinks.length, uncertain: uncertainLinks.length, suffix }, `Scan complete: ${brokenLinks.length} confirmed broken, ${uncertainLinks.length} need review. ${suffix}`), 'warning', true);
            } else {
              const suffix = cacheHits > 0
                ? t('popup.tools.brokenCacheSuffix', { count: cacheHits }, `(reused ${cacheHits} cached results)`)
                : '';
              setToolDetailStatusText(t('popup.tools.brokenDoneReviewOnly', { uncertain: uncertainLinks.length, suffix }, `Scan complete: no high-confidence broken links found, ${uncertainLinks.length} need review. ${suffix}`), 'warning', true);
            }
            document.getElementById('statusBrokenLinks').textContent = t('popup.tools.brokenLastStatus', { broken: brokenLinks.length, uncertain: uncertainLinks.length }, `Last scan: ${brokenLinks.length} confirmed broken / ${uncertainLinks.length} review needed`);

            let html = '';
            if (brokenLinks.length > 0) {
              html += `<div class="tool-check-group-title">${escapeHtml(t('popup.tools.brokenConfirmedGroup', null, 'Confirmed Broken'))}</div>`;
              html += `<div class="tool-check-group">`;
              brokenLinks.forEach((b) => {
                const reason = getBrokenProbeReasonLabel(b.probe);
                html += `<div class="tool-check-item">
                          <input type="checkbox" class="broken-checkbox" data-id="${b.node.id}" checked>
                          <span class="tool-check-label" title="${escapeHtml(b.node.url)}">❌ ${escapeHtml(b.node.title || t('common.untitled', null, 'Untitled'))}</span>
                         </div>
                         <div class="tool-check-url tool-check-url-error">${escapeHtml(b.node.url)}<br>[${escapeHtml(reason)}]</div>`;
              });
              html += `</div>`;
            }
            if (uncertainLinks.length > 0) {
              html += `<div class="tool-check-group-title">${escapeHtml(t('popup.tools.brokenReviewGroup', null, 'Needs Review (cross-origin, anti-bot, or network issues possible)'))}</div>`;
              html += `<div class="tool-check-group tool-check-group-dashed">`;
              uncertainLinks.forEach((u) => {
                const reason = getBrokenProbeReasonLabel(u.probe);
                html += `<div class="tool-check-item">
                          <input type="checkbox" class="broken-checkbox" data-id="${u.node.id}">
                          <span class="tool-check-label" title="${escapeHtml(u.node.url)}">⚠️ ${escapeHtml(u.node.title || t('common.untitled', null, 'Untitled'))}</span>
                         </div>
                         <div class="tool-check-url tool-check-url-warn">${escapeHtml(u.node.url)}<br>[${escapeHtml(reason)}]</div>`;
              });
              html += `</div>`;
            }

            toolDetailFooter.style.display = 'flex';
            toolDetailFooter.style.justifyContent = 'center';
            toolDetailFooter.innerHTML = `<button id="btnCleanBrokenLinks" class="tool-btn tool-btn-danger">${escapeHtml(t('popup.tools.brokenClean', null, 'Delete Selected'))}</button>`;
            toolsResultList.innerHTML = html;
            setScanIdle();
            if (brokenLinkScanSession === scanSession) brokenLinkScanSession = null;

            document.getElementById('btnCleanBrokenLinks').addEventListener('click', async (eClean) => {
              const checkboxes = toolsResultList.querySelectorAll('.broken-checkbox:checked');
              if (checkboxes.length === 0) return;
              const cleanButton = eClean.currentTarget;
              if (!(await confirmDangerAction(
                t('popup.tools.brokenConfirmDelete', { count: checkboxes.length }, `Delete the selected ${checkboxes.length} links?`),
                {
                  okText: t('common.delete', null, 'Delete'),
                  hint: brokenLinks.length === 0
                    ? t('popup.tools.brokenReviewHint', null, 'All selected items still need review. Confirm manually before deleting.')
                    : t('popup.tools.brokenDangerHint', null, 'High-confidence broken links are included, but a quick manual review is still recommended.')
                }
              ))) return;
              await runToolBatchCleanup({
                button: cleanButton,
                ids: Array.from(checkboxes).map((cb) => cb.getAttribute('data-id')),
                removeFn: removeBookmarkAsync,
                idleText: t('popup.tools.brokenClean', null, 'Delete Selected'),
                afterSuccess: async ({ successIds }) => {
                  updateBrokenCleanupView(successIds, t('popup.tools.brokenClean', null, 'Delete Selected'));
                }
              });
            });
          });
        });
      });
    }

    if (btnCleanEmptyFolders) {
      btnCleanEmptyFolders.addEventListener('click', () => {
        openToolView(t('popup.tools.emptyFoldersTitle', null, 'Clean Empty Folders'));
        toolDetailStatus.style.display = 'flex';
        setToolDetailStatusText(t('popup.tools.emptyFoldersIdle', null, 'Status: not analyzed yet'));
        toolDetailMainAction.innerHTML = `<button id="btnStartCleanEmpty" class="tool-btn tool-btn-primary">${escapeHtml(t('popup.tools.emptyFoldersStart', null, 'Start Scan'))}</button>`;
        toolDetailWarning.style.display = 'block';
        toolDetailWarning.innerHTML = t('popup.tools.emptyFoldersWarning', null, '💡 Finds and permanently removes folders that contain neither bookmarks nor any valid child folders.');

        document.getElementById('btnStartCleanEmpty').addEventListener('click', (e) => {
          const btn = e.target;
          btn.className = 'tool-btn tool-btn-primary';
          btn.disabled = true;
          btn.textContent = t('popup.tools.statusRunning', null, 'Working...');
          toolDetailStatus.style.display = 'flex';
          setToolDetailStatusText(t('popup.tools.emptyFoldersScanning', null, 'Running: scanning structure...'));
          setToolsResultMessage(t('popup.tools.statusRunning', null, 'Working...'));

          getBookmarkTreeCached((tree) => {
            let emptyFolders = [];
            // 只找最底层的、没有任何子项的文件夹
            function traverse(nodes) {
              nodes.forEach(node => {
                // exclude root and basic roots if possible
                if (!node.url && node.id !== '0' && node.id !== '1' && node.id !== '2') {
                  if (!node.children || node.children.length === 0) {
                    emptyFolders.push(node);
                  } else {
                    traverse(node.children);
                  }
                } else if (node.children) {
                  traverse(node.children);
                }
              });
            }
            traverse(tree);

            if (emptyFolders.length === 0) {
              setToolDetailStatusText(t('popup.tools.emptyFoldersNone', null, 'Scan complete: no empty folders found.'), 'success');
              setToolsResultMessage(t('popup.tools.cleanLibrary', null, '🎉 Your bookmark library is very clean!'));
              document.getElementById('statusEmptyFolders').textContent = t('popup.tools.emptyFoldersLastStatusZero', null, 'Last scan: 0 empty folders');
              toolDetailFooter.style.display = 'none';
              toolDetailFooter.innerHTML = '';
              btn.disabled = false;
              btn.textContent = t('popup.tools.duplicatesRescan', null, 'Scan Again');
              btn.className = 'tool-btn tool-btn-secondary';
              return;
            }

            setToolDetailStatusText(t('popup.tools.emptyFoldersDone', { count: emptyFolders.length }, `Scan complete: found ${emptyFolders.length} empty folders.`), 'warning', true);
            document.getElementById('statusEmptyFolders').textContent = t('popup.tools.emptyFoldersLastStatus', { count: emptyFolders.length }, `Last scan: ${emptyFolders.length} empty folders`);

            let html = `<div class="tool-check-group">`;
            emptyFolders.forEach((node) => {
              html += `<div class="tool-check-item">
                        <input type="checkbox" class="empty-folder-checkbox" data-id="${node.id}" checked>
                        <span class="tool-check-label" title="${escapeHtml(node.title)}">📁 ${escapeHtml(node.title || t('common.untitled', null, 'Untitled'))}</span>
                       </div>`;
            });
            html += `</div>`;

            toolDetailFooter.style.display = 'flex';
            toolDetailFooter.style.justifyContent = 'center';
            toolDetailFooter.innerHTML = `<button id="btnCleanFolders" class="tool-btn tool-btn-danger">${escapeHtml(t('popup.tools.emptyFoldersClean', null, 'Delete Selected'))}</button>`;
            toolsResultList.innerHTML = html;
            btn.disabled = false;
            btn.textContent = t('popup.tools.duplicatesRescan', null, 'Scan Again');
            btn.className = 'tool-btn tool-btn-secondary';

            document.getElementById('btnCleanFolders').addEventListener('click', async (eClean) => {
              const checkboxes = toolsResultList.querySelectorAll('.empty-folder-checkbox:checked');
              if (checkboxes.length === 0) return;
              const cleanButton = eClean.currentTarget;
              if (!(await confirmDangerAction(
                t('popup.tools.emptyFoldersConfirm', { count: checkboxes.length }, `Delete the selected ${checkboxes.length} empty folders?`),
                { okText: t('common.delete', null, 'Delete') }
              ))) return;
              await runToolBatchCleanup({
                button: cleanButton,
                ids: Array.from(checkboxes).map((cb) => cb.getAttribute('data-id')),
                removeFn: removeBookmarkTreeAsync,
                idleText: t('popup.tools.emptyFoldersClean', null, 'Delete Selected'),
                afterSuccess: async ({ successIds }) => {
                  updateEmptyFolderCleanupView(successIds, t('popup.tools.emptyFoldersClean', null, 'Delete Selected'));
                }
              });
            });
          });
        });
      });
    }

  }

  // --- IMPORT HANDLE ---
  function getBookmarkImportService() {
    if (
      !bookmarkService
      || !bookmarkService.readFileAsText
      || !bookmarkService.parseImportedHtmlBookmarks
      || !bookmarkService.countImportableNodes
      || !bookmarkService.getImportParentId
      || !bookmarkService.createBookmarkAsync
      || !bookmarkService.importNodesRecursive
    ) {
      throw new Error('Import module not loaded');
    }
    return bookmarkService;
  }

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const importService = getBookmarkImportService();
      toolDetailStatus.style.display = 'flex';
      setToolDetailStatusText(t('popup.tools.importReading', null, 'Status: reading import file...'));
      setToolsResultMessage(t('popup.tools.importParsing', null, 'Parsing file...'));

      const rawText = await importService.readFileAsText(file);
      const parsedNodes = importService.parseImportedHtmlBookmarks(rawText);
      const summary = importService.countImportableNodes(parsedNodes);

      if (summary.total === 0) {
        setToolDetailStatusText(t('popup.tools.importEmpty', null, 'Status: no importable bookmark items detected'), 'warning');
        setToolsResultMessage(t('popup.tools.importEmptyResult', null, 'No importable data found in this file'));
        return;
      }

      const shouldImport = await confirmDangerAction(
        t('popup.tools.importPrompt', { file: file.name, bookmarks: summary.bookmarks, folders: summary.folders }, `Import ${summary.bookmarks} bookmarks and ${summary.folders} folders from "${file.name}"?`),
        {
          title: t('popup.confirm.importTitle', null, 'Import Bookmarks'),
          hint: t('popup.confirm.importHint', null, 'A new import folder will be created automatically so you can reorganize later.'),
          okText: t('popup.confirm.importOk', null, 'Start Import'),
          variant: 'normal'
        }
      );
      if (!shouldImport) {
        setToolDetailStatusText(t('popup.tools.importCancelled', null, 'Status: import cancelled'));
        toolsResultList.innerHTML = '';
        return;
      }

      const importParentId = await importService.getImportParentId(chrome);
      const defaultBaseName = t('popup.tools.importDefaultBaseName', null, 'Bookmarks');
      const baseName = (file.name || defaultBaseName).replace(/\.[^.]+$/, '').trim() || defaultBaseName;
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-');
      const importFolder = await importService.createBookmarkAsync(chrome, {
        parentId: importParentId,
        title: t('popup.tools.importFolderName', { name: baseName, stamp }, `Jade Import · ${baseName} · ${stamp}`)
      });

      const stats = {
        folders: 1, // 含导入根文件夹
        bookmarks: 0,
        skipped: 0,
        processed: 0,
        total: summary.total
      };

      setToolDetailStatusText(t('popup.tools.importProgress', { percent: 0, processed: 0, total: Math.max(summary.total, 1) }, 'Status: importing 0%'));
      await importService.importNodesRecursive(chrome, importFolder.id, parsedNodes, stats, (processed, total) => {
        const safeTotal = Math.max(total, 1);
        const pct = Math.min(100, Math.round((processed / safeTotal) * 100));
        setToolDetailStatusText(t('popup.tools.importProgress', { percent: pct, processed, total: safeTotal }, `Status: importing ${pct}% (${processed}/${safeTotal})`));
      });

      invalidateBookmarkTreeCache();
      refreshView();

      document.getElementById('statusImport').textContent = t('popup.tools.importLastStatus', { bookmarks: stats.bookmarks, folders: stats.folders }, `Last import: ${stats.bookmarks} bookmarks / ${stats.folders} folders`);
      setToolDetailStatusText(t('popup.tools.importDone', { success: stats.bookmarks + stats.folders, skipped: stats.skipped }, `Status: import complete (${stats.bookmarks + stats.folders} imported, ${stats.skipped} skipped)`), 'success');
      toolsResultList.innerHTML = `
        <div class="import-summary-card">
          <div class="import-summary-title">${escapeHtml(t('popup.tools.importSummaryTitle', { title: importFolder.title }, `Imported into: ${importFolder.title}`))}</div>
          <div class="import-summary-meta">
            ${escapeHtml(t('popup.tools.importSummaryBookmarks', { count: stats.bookmarks }, `Bookmarks imported: ${stats.bookmarks}`))}<br>
            ${escapeHtml(t('popup.tools.importSummaryFolders', { count: stats.folders }, `Folders imported: ${stats.folders}`))}<br>
            ${escapeHtml(t('popup.tools.importSummarySkipped', { count: stats.skipped }, `Skipped: ${stats.skipped}`))}
          </div>
        </div>
      `;
    } catch (err) {
      const reason = err && err.message ? err.message : t('popup.reasons.unknown', null, 'Unknown reason');
      setToolDetailStatusText(t('popup.tools.importFailed', { reason }, `Status: import failed (${reason})`), 'error');
      setToolsResultMessage(t('popup.tools.importFailedResult', null, 'Import failed. Verify the file is a standard HTML bookmarks export.'), 'error');
    } finally {
      e.target.value = '';
    }
  }

  // --- EXPORT HANDLE (HTML) ---
  function handleExportBookmarks(btn) {
    getBookmarkTreeCached((tree) => {
      let htmlContent = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;
      function traverseNode(node) {
        if (node.title === "" && !node.children) return; // Skip dummy roots if any
        if (node.url) {
          const addDate = node.dateAdded ? Math.floor(node.dateAdded / 1000) : 0;
          htmlContent += `    <DT><A HREF="${escapeHtmlAttr(node.url)}" ADD_DATE="${addDate}">${escapeHtml(node.title)}</A>\n`;
        } else if (node.children) {
          const addDate = node.dateAdded ? Math.floor(node.dateAdded / 1000) : 0;
          const title = node.title || (node.id === '1' ? 'Bookmark Bar' : (node.id === '2' ? 'Other Bookmarks' : 'Folder'));
          if (node.id !== '0') {
            htmlContent += `    <DT><H3 ADD_DATE="${addDate}">${escapeHtml(title)}</H3>\n    <DL><p>\n`;
          }
          node.children.forEach(traverseNode);
          if (node.id !== '0') {
            htmlContent += `    </DL><p>\n`;
          }
        }
      }
      traverseNode(tree[0]);
      htmlContent += `</DL><p>`;

      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10);

      chrome.downloads.download({
        url: url,
        filename: `bookmarks_${dateStr}.html`,
        saveAs: true
      }, (downloadId) => {
        URL.revokeObjectURL(url);
        const runtimeError = chrome.runtime && chrome.runtime.lastError;
        if (runtimeError || typeof downloadId !== 'number') {
          const reason = runtimeError && runtimeError.message
            ? runtimeError.message
            : t('popup.reasons.unknown', null, 'Unknown reason');
          setToolDetailStatusText(t('popup.tools.exportFailed', { reason }, `Status: export failed (${reason})`), 'error');
          setToolsResultMessage(t('popup.tools.exportFailed', { reason }, `Status: export failed (${reason})`), 'error');
          if (btn) {
            btn.disabled = false;
            btn.textContent = t('popup.tools.exportRetry', null, 'Export Again');
            btn.className = 'tool-btn tool-btn-secondary';
          }
          return;
        }
        setToolDetailStatusText(t('popup.tools.exportDone', null, 'Status: export complete'), 'success');
        setToolsResultMessage(t('popup.tools.exportQueued', { date: dateStr }, `Export started (${dateStr})`));
        if (btn) {
          btn.disabled = false;
          btn.textContent = t('popup.tools.exportRetry', null, 'Export Again');
          btn.className = 'tool-btn tool-btn-secondary';
        }
      });
    });
  }

  // --- 初始化 ---
  init();
});

