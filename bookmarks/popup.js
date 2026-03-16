document.addEventListener('DOMContentLoaded', function () {
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
  const bookmarkTreeCacheManager = bookmarkService && bookmarkService.createTreeCache
    ? bookmarkService.createTreeCache(chrome)
    : null;
  const bookmarkTreeCacheFallback = {
    data: null,
    inFlight: null
  };
  const DEAD_LINK_CACHE_KEY = 'dead_link_probe_cache_v1';
  const DEAD_LINK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const DEAD_LINK_CACHE_MAX_ENTRIES = 4000;
  let deadLinkProbeCache = {};
  let deadLinkCachePersistTimer = null;

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
          console.warn('[Jade] 获取书签树失败:', chrome.runtime.lastError.message);
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
    shortcutHint.textContent = isMac ? '⌘K' : 'Ctrl K';
  }

  // --- 初始化 ---
  init();

  function init() {
    setupBookmarkCacheInvalidation();

    // 载入置顶、黑名单、排序和自定义标题，然后构建首页
    chrome.storage.local.get(
      ['pinned_bookmarks', 'frequent_order', 'frequent_custom_titles', 'frequent_custom_urls', 'hidden_recent_urls', DEAD_LINK_CACHE_KEY],
      (res) => {
      if (res.pinned_bookmarks) {
        pinnedIds = new Set(res.pinned_bookmarks);
      }
      if (res.frequent_order) {
        frequentOrder = res.frequent_order;
      }
      if (res.frequent_custom_titles) {
        frequentCustomTitles = res.frequent_custom_titles;
      }
      if (res.frequent_custom_urls) {
        frequentCustomUrls = res.frequent_custom_urls;
      }
      if (res.hidden_recent_urls) {
        hiddenRecentUrls = res.hidden_recent_urls;
      }
      if (res[DEAD_LINK_CACHE_KEY] && typeof res[DEAD_LINK_CACHE_KEY] === 'object') {
        deadLinkProbeCache = res[DEAD_LINK_CACHE_KEY];
        pruneDeadLinkProbeCache();
        schedulePersistDeadLinkProbeCache(800);
      }

      chrome.bookmarks.get('1', (nodes) => {
        if (nodes && nodes.length > 0) {
          const bookmarkBar = nodes[0];
          navigationStack = [{ id: bookmarkBar.id, title: bookmarkBar.title || '书签栏' }];
          // Start by building the dashboard (Home view)
          buildDashboard();
        }
      });
      }
    );

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
            <div>将你最常访问的网站添加到这里<br>最多 8 个，仅由你手动管理。</div>
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

        const itemKey = item.id || domain;
        let shortName = frequentCustomTitles[itemKey] || item.title || domain || '未命名文件夹';
        shortName = shortName.split(' - ')[0].split(' | ')[0].split(' _ ')[0].trim();
        if (shortName.length > 10) shortName = shortName.substring(0, 10) + '..';

        const iconHtml = isFolder
          ? `<svg class="icon-muted" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
               <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
             </svg>`
          : `<img src="chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(item.url)}&size=128"
                  class="frequent-favicon">`;

        a.innerHTML = `
              <div class="frequent-actions" title="取消置顶">
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
            chrome.tabs.create({ url: frequentCustomUrls[itemKey] || item.url });
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

          const targetId = item.id || domain;
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

          frequentOrder = currentFrequentItems.map(it => it.id || it.domain || '');
          chrome.storage.local.set({ frequent_order: frequentOrder });

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
      function traverse(nodes) {
        nodes.forEach(n => {
          if (pinnedIds.has(n.id)) pinnedNodes.push(n);
          if (n.children) traverse(n.children);
        });
      }
      traverse(tree);

      // 清理幽灵 ID：pinnedIds 中存在但书签树中找不到的无效 ID
      const foundIds = new Set(pinnedNodes.map(n => n.id));
      const orphanIds = Array.from(pinnedIds).filter(id => !foundIds.has(id));
      if (orphanIds.length > 0) {
        orphanIds.forEach(id => pinnedIds.delete(id));
        chrome.storage.local.set({ pinned_bookmarks: Array.from(pinnedIds) });
        console.info(`[Jade] 已清理 ${orphanIds.length} 个无效置顶 ID:`, orphanIds);
      }

      const pinnedOrder = Array.from(pinnedIds);
      pinnedNodes.sort((a, b) => {
        const idA = a.id;
        const idB = b.id;
        const indexA = pinnedOrder.indexOf(idA);
        const indexB = pinnedOrder.indexOf(idB);
        return indexA - indexB;
      });

      let finalItems = pinnedNodes;

      // 应用用户自定义的排序 (frequentOrder)
      finalItems.sort((a, b) => {
        const idA = a.id;
        const idB = b.id;
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
              type: '最近关闭',
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
          type: '历史记录',
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
              暂无最近访问记录
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
            showContextMenu(e, false, false, true);
          });

          let domain = '';
          try {
            domain = new URL(item.url || 'about:blank').hostname;
          } catch (e) {
            domain = '';
          }

          const timeAgo = getTimeAgo(item.timestamp || Date.now());
          const metaInfo = item.type === '历史记录' ? timeAgo : `${item.type} · ${timeAgo}`;

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
            chrome.tabs.create({ url: item.url });
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
              rootBookmarks.push({ ...child, parentTitle: rootNode.title || '根目录' });
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
          title: '未分类书签',
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
                   onerror="this.src='https://www.google.com/s2/favicons?domain=${domain}&sz=32'"
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

    card.onclick = () => {
      enterFolder(folder.id, folder.title, folder.isUncategorized);
    };

    // Context menu
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      targetNodeId = folder.id;
      targetNodeIsFolder = true;
      showContextMenu(e, true);
    });

    categoryGrid.appendChild(card);
  }

  function getTimeAgo(timestamp) {
    if (dashboardModule && typeof dashboardModule.getTimeAgo === 'function') {
      return dashboardModule.getTimeAgo(timestamp);
    }
    if (!timestamp) return '未知时间';
    let ts = timestamp;
    if (ts < 10000000000) ts *= 1000;

    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);

    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;

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

    if (isToday) return `今天 ${hh}:${mm}`;
    if (isYesterday) return `昨天 ${hh}:${mm}`;

    return `${date.getMonth() + 1}月${date.getDate()}日`;
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
                rootBookmarks.push({ ...child, parentTitle: rootNode.title || '根目录' });
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
      span.textContent = `搜索: "${searchQuery}"`;
      breadcrumb.appendChild(span);

      const clearBtn = document.createElement('span');
      clearBtn.textContent = '清除';
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
    backBtn.innerHTML = `<svg class="inline-back-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg> 返回`;

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
                recentTabs.push({ title: session.tab.title, url: session.tab.url, meta: '[最近关闭]' });
              } else if (session.window && session.window.tabs) {
                session.window.tabs.forEach(t => {
                  if (t.title.toLowerCase().includes(query.toLowerCase())) {
                    recentTabs.push({ title: t.title, url: t.url, meta: '[最近关闭 window]' });
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
      bookmarkList.innerHTML = `<div class="empty-state">${isSearchResult ? '未找到相关内容' : '此文件夹为空'}</div>`;
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
                 onerror="this.src='https://www.google.com/s2/favicons?domain=${domain}&sz=64'">
           </div>`;

      const displayTitle = item.title || (isFolder ? '未命名文件夹' : '无标题');
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

      a.onclick = (e) => {
        e.preventDefault();
        if (isFolder) {
          enterFolder(item.id, item.title);
        } else {
          chrome.tabs.create({ url: item.url });
        }
      };

      // Keyboard enter key
      a.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (e.metaKey || e.ctrlKey) {
            // Open in background tab
            if (!isFolder) chrome.tabs.create({ url: item.url, active: false });
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
      title = '确认危险操作',
      hint = '此操作不可撤销，是否继续？',
      okText = '继续',
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
    if (!probe) return '未知原因';
    if (probe.reason === 'http_404') return 'HTTP 404（页面不存在）';
    if (probe.reason === 'http_410') return 'HTTP 410（资源已删除）';
    if (probe.reason === 'http_451') return 'HTTP 451（受法律限制）';
    if (probe.reason === 'network_failure') return '网络连接失败';
    if (probe.reason === 'timeout') return '请求超时';
    if (probe.reason === 'head_blocked') return 'HEAD 请求受限';
    if (probe.reason === 'head_inconclusive') return 'HEAD 返回非确定状态';
    if (probe.reason === 'opaque_get') return '仅 no-cors 可访问（待复核）';
    if (probe.reason && probe.reason.startsWith('http_')) return `HTTP ${probe.reason.replace('http_', '')}`;
    return probe.reason || '未知原因';
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
  function showToast(msg, undoCallback = null) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    const toastAction = document.getElementById('toastAction');

    if (!toast) return;

    toastMsg.textContent = msg;
    if (undoCallback) {
      toastAction.style.display = 'block';
      toastAction.onclick = () => {
        undoCallback();
        toast.classList.remove('show');
        if (undoTimeout) clearTimeout(undoTimeout);
      };
    } else {
      toastAction.style.display = 'none';
    }

    toast.classList.add('show');
    if (undoTimeout) clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 4000);
  }

  function removeFromPinnedWithUndo(id, oldIndex) {
    const orderBefore = Array.from(pinnedIds);
    const frequentOrderBefore = [...frequentOrder];

    pinnedIds.delete(id);
    chrome.storage.local.set({ pinned_bookmarks: Array.from(pinnedIds) }, () => {
      if (navigationStack.length <= 1) buildDashboard();
      else refreshView();
      showToast('已从我的置顶移除', () => {
        // undo
        pinnedIds = new Set(orderBefore);
        frequentOrder = frequentOrderBefore;
        chrome.storage.local.set({
          pinned_bookmarks: Array.from(pinnedIds),
          frequent_order: frequentOrder
        }, () => {
          if (navigationStack.length <= 1) buildDashboard();
          else refreshView();
        });
      });
    });
  }

  // --- 右键菜单与模态框处理 ---
  function showContextMenu(e, isFolder, isFrequent = false, isRecent = false) {
    const visibility = contextMenuModule && contextMenuModule.resolveVisibility
      ? contextMenuModule.resolveVisibility({
        isFolder,
        isFrequent,
        isRecent,
        targetNodeId,
        targetNodeDomain,
        pinnedIds
      })
      : {
        showPin: !isRecent,
        pinText: pinnedIds.has(targetNodeId || targetNodeDomain) ? '从我的置顶移除' : '添加到我的置顶',
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
        showToast('开发中：支持将其添加到我的分组');
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
            showToast('已从最近访问列表移除', () => {
              // 撤销逻辑
              hiddenRecentUrls = hiddenRecentUrls.filter(u => u !== activeUrl);
              chrome.storage.local.set({ hidden_recent_urls: hiddenRecentUrls }, () => {
                buildRecents();
              });
            });
          });
        }
        contextMenu.style.display = 'none';
      });
    }

    menuPin.addEventListener('click', () => {
      const activeId = targetNodeId || targetNodeDomain;
      if (!activeId) return;

      if (pinnedIds.has(activeId)) {
        removeFromPinnedWithUndo(activeId, -1);
      } else {
        if (pinnedIds.size >= 8) {
          showToast('我的置顶最多只能添加 8 个网站');
          return;
        }
        pinnedIds.add(activeId);
        chrome.storage.local.set({ pinned_bookmarks: Array.from(pinnedIds) }, () => {
          if (navigationStack.length <= 1) buildDashboard();
          else refreshView();
          showToast('已添加到我的置顶');
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
          editModalTitle.textContent = targetNodeIsFolder ? '编辑文件夹' : '编辑书签';
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
        editModalTitle.textContent = '编辑常用访问';
        editTitleInput.value = frequentCustomTitles[targetNodeDomain] || targetNodeDomain;
        if (editUrlGroup) editUrlGroup.style.display = 'block';
        editUrlInput.value = frequentCustomUrls[targetNodeDomain] || targetFrequentUrl || '';
        editModal.style.display = 'flex';
        editTitleInput.focus();
      }
    });

    menuDelete.addEventListener('click', async () => {
      if (!targetNodeId) return;
      const confirmMessage = targetNodeIsFolder
        ? '确定删除该文件夹及其所有子项吗？'
        : '确定删除该书签吗？';
      if (!(await confirmDangerAction(confirmMessage, { okText: '删除' }))) return;
      if (targetNodeIsFolder) {
        chrome.bookmarks.removeTree(targetNodeId, refreshView);
      } else {
        chrome.bookmarks.remove(targetNodeId, refreshView);
      }
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
        frequentCustomTitles[targetNodeDomain] = title;
        const customUrl = editUrlInput.value.trim();
        if (customUrl) frequentCustomUrls[targetNodeDomain] = customUrl;
        chrome.storage.local.set({
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

  function openToolView(titleStr) {
    toolsMenuView.classList.remove('active');
    toolsDetailView.classList.add('active');
    toolsMenuView.style.display = 'none';
    toolsDetailView.style.display = 'block';

    toolsTitle.textContent = titleStr;
    toolsBackBtn.style.visibility = 'visible';

    toolDetailStatus.style.display = 'none';
    toolDetailStatus.innerHTML = '';
    toolDetailMainAction.innerHTML = '';
    toolDetailWarning.style.display = 'none';
    toolDetailWarning.innerHTML = '';
    toolDetailFooter.style.display = 'none';
    toolDetailFooter.innerHTML = '';
    toolsResultList.innerHTML = '';
  }

  function closeToolView() {
    cancelBrokenLinkScanSilently();
    toolsDetailView.classList.remove('active');
    toolsMenuView.classList.add('active');
    toolsDetailView.style.display = 'none';
    toolsMenuView.style.display = 'block';

    toolsTitle.textContent = '书签工具箱';
    toolsBackBtn.style.visibility = 'hidden';
    toolsResultList.innerHTML = '';
  }

  function setupToolsListeners() {
    importFileInput.addEventListener('change', handleImport);

    // 0. 导入书签
    if (btnImportBookmarksNew) {
      btnImportBookmarksNew.addEventListener('click', () => {
        openToolView('导入书签');
        toolDetailStatus.style.display = 'flex';
        setToolDetailStatusText('状态：等待选择文件');

        toolDetailMainAction.innerHTML = `<button id="btnSelectImportFile" class="tool-btn tool-btn-primary">选择文件</button>`;
        toolDetailWarning.style.display = 'block';
        toolDetailWarning.innerHTML = '⚠️ 导入会在“其他书签”下创建新文件夹并写入内容。支持标准 HTML 书签文件（Netscape 格式），导入后可手动整理。';

        document.getElementById('btnSelectImportFile').addEventListener('click', () => {
          importFileInput.click();
        });
      });
    }

    // 0.1 导出书签
    if (btnExportBookmarksNew) {
      btnExportBookmarksNew.addEventListener('click', () => {
        openToolView('导出书签');
        toolDetailStatus.style.display = 'flex';
        setToolDetailStatusText('状态：准备导出');

        toolDetailMainAction.innerHTML = `<button id="btnExecuteExport" class="tool-btn tool-btn-primary">立即导出</button>`;
        toolDetailWarning.style.display = 'block';
        toolDetailWarning.innerHTML = '💡 提示：导出书签将把当前所有书签及目录结构备份为一个标准 HTML 文件，可用于在其他浏览器中恢复。';

        document.getElementById('btnExecuteExport').addEventListener('click', (e) => {
          e.target.className = 'tool-btn tool-btn-primary';
          e.target.disabled = true;
          e.target.textContent = '处理中...';
          setToolDetailStatusText('状态：正在生成...');
          handleExportBookmarks(e.target);
        });
      });
    }

    // 1. 扫描重复书签
    if (btnFindDuplicates) {
      btnFindDuplicates.addEventListener('click', () => {
        openToolView('扫描重复');
        toolDetailStatus.style.display = 'flex';
        setToolDetailStatusText('状态：尚未扫描');

        toolDetailMainAction.innerHTML = `<button id="btnStartFindDuplicates" class="tool-btn tool-btn-primary">开始扫描</button>`;
        toolDetailWarning.style.display = 'block';
        toolDetailWarning.innerHTML = '💡 提示：基于完全相同的 URL 来判断重复。批量清理重复项后将不可撤销退回，请谨慎操作。';

        document.getElementById('btnStartFindDuplicates').addEventListener('click', (e) => {
          const btn = e.target;
          btn.className = 'tool-btn tool-btn-primary';
          btn.disabled = true;
          btn.textContent = '处理中...';
          toolDetailStatus.style.display = 'flex';
          setToolDetailStatusText('运行中：正在扫描整个书签库...');
          setToolsResultMessage('处理中...');

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

            let duplicateGroups = [];
            urlMap.forEach((nodes, url) => {
              if (nodes.length > 1) duplicateGroups.push({ url, nodes });
            });

            if (duplicateGroups.length === 0) {
              setToolDetailStatusText('扫描完成：未发现任何重复的书签。', 'success');
              setToolsResultMessage('🎉 您的书签库非常整洁！');
              document.getElementById('statusDuplicates').textContent = '上次扫描：0 项重复';
              btn.disabled = false;
              btn.textContent = '重新扫描';
              btn.className = 'tool-btn tool-btn-secondary';
              return;
            }

            setToolDetailStatusText(`扫描完成：共发现 ${duplicateGroups.length} 组重复链接。`, 'warning', true);
            document.getElementById('statusDuplicates').textContent = `上次扫描：${duplicateGroups.length} 组重复`;

            let html = '';
            duplicateGroups.forEach(group => {
              html += `<div class="tool-check-group">
                                    <div class="tool-check-url">${escapeHtml(group.url)}</div>`;
              group.nodes.forEach((node, nIdx) => {
                const shouldCheck = nIdx > 0;
                html += `<div class="tool-check-item">
                                        <input type="checkbox" class="duplicate-checkbox" data-id="${node.id}" ${shouldCheck ? 'checked' : ''}>
                                        <span class="tool-check-label" title="${escapeHtml(node.title)}">${escapeHtml(node.title || '无标题')}</span>
                                       </div>`;
              });
              html += `</div>`;
            });

            toolDetailFooter.style.display = 'flex';
            toolDetailFooter.innerHTML = `<button id="btnCleanDuplicates" class="tool-btn tool-btn-danger">清理选中项</button>`;
            toolsResultList.innerHTML = html;
            btn.disabled = false;
            btn.textContent = '重新扫描';
            btn.className = 'tool-btn tool-btn-secondary';

            document.getElementById('btnCleanDuplicates').addEventListener('click', async (eClean) => {
              const checkboxes = toolsResultList.querySelectorAll('.duplicate-checkbox:checked');
              if (checkboxes.length === 0) return;
              if (!(await confirmDangerAction(`确定删除选中的 ${checkboxes.length} 个重复书签吗？`, { okText: '删除' }))) return;
              eClean.target.className = 'tool-btn tool-btn-danger';
              eClean.target.disabled = true;
              eClean.target.textContent = '清理中...';
              setToolDetailStatusText('处理中：正在移除选中项...');
              let promises = Array.from(checkboxes).map(cb => {
                return new Promise(res => chrome.bookmarks.remove(cb.getAttribute('data-id'), res));
              });
              Promise.all(promises).then(() => {
                document.getElementById('btnStartFindDuplicates').click(); // Rescan
                refreshView();
              });
            });
          });
        });
      });
    }

    // 2. 统计报告
    if (btnBookmarkStats) {
      btnBookmarkStats.addEventListener('click', () => {
        openToolView('书签统计');
        toolDetailStatus.style.display = 'flex';
        setToolDetailStatusText('状态：尚未分析');

        toolDetailMainAction.innerHTML = `<button id="btnStartStats" class="tool-btn tool-btn-primary">开始分析</button>`;
        toolDetailWarning.style.display = 'block';
        toolDetailWarning.innerHTML = '💡 提示：全面统计书签库的层级结构与健康度，并生成域名的分布榜单，分析过程完全在本地进行。';

        document.getElementById('btnStartStats').addEventListener('click', (e) => {
          const btn = e.target;
          btn.className = 'tool-btn tool-btn-primary';
          btn.disabled = true;
          btn.textContent = '处理中...';
          setToolDetailStatusText('运行中：正在收集数据...');

          getBookmarkTreeCached((tree) => {
            let totalBookmarks = 0;
            let totalFolders = 0;
            let maxDepth = 0;
            let emptyFolders = 0;
            const domainMap = new Map();
            const urlSet = new Map(); // url -> count
            let largestFolder = { title: '-', count: 0 };

            function traverse(nodes, depth) {
              nodes.forEach(node => {
                if (node.url) {
                  totalBookmarks++;
                  // 域名统计
                  try {
                    const hostname = new URL(node.url).hostname;
                    if (hostname) {
                      domainMap.set(hostname, (domainMap.get(hostname) || 0) + 1);
                    }
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
                    largestFolder = { title: node.title || '未命名', count: directChildren };
                  }
                  traverse(node.children, depth + 1);
                }
              });
            }
            traverse(tree, 1);

            // 重复链接数
            let duplicateCount = 0;
            urlSet.forEach((count) => { if (count > 1) duplicateCount++; });

            // 域名 Top 10
            const sortedDomains = [...domainMap.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10);
            const topCount = sortedDomains.length > 0 ? sortedDomains[0][1] : 1;

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

            setToolDetailStatusText('分析完成', 'success');
            toolsResultList.innerHTML = `
              <div class="stats-card-grid stats-card-grid-tight">
                <div class="stat-card stat-card-compact">
                  <div class="stat-value stat-value-medium">${totalBookmarks}</div>
                  <div class="stat-label">书签总数</div>
                </div>
                <div class="stat-card stat-card-compact">
                  <div class="stat-value stat-value-medium">${totalFolders}</div>
                  <div class="stat-label">文件夹总数</div>
                </div>
                <div class="stat-card stat-card-compact">
                  <div class="stat-value stat-value-medium">${maxDepth}</div>
                  <div class="stat-label">最深层级</div>
                </div>
                <div class="stat-card stat-card-compact">
                  <div class="stat-value stat-value-medium ${emptyFolders > 0 ? 'stat-value-warning' : ''}">${emptyFolders}</div>
                  <div class="stat-label">空文件夹</div>
                </div>
              </div>

              <div class="stats-section">
                <div class="stats-section-title">域名分布 Top 10</div>
                <div class="stats-section-panel stats-domain-list">
                  ${domainHtml || '<div class="stats-empty">暂无数据</div>'}
                </div>
              </div>

              <div class="stats-section">
                <div class="stats-section-title">结构健康度</div>
                <div class="stats-section-panel stats-health-list">
                  <div class="stats-health-row">
                    <span class="stats-health-label">重复链接</span>
                    <span class="stats-health-value ${duplicateCount > 0 ? 'stats-health-warning' : 'stats-health-good'}">${duplicateCount > 0 ? `${duplicateCount} 组` : '无'}</span>
                  </div>
                  <div class="stats-health-row">
                    <span class="stats-health-label">空文件夹</span>
                    <span class="stats-health-value ${emptyFolders > 0 ? 'stats-health-warning' : 'stats-health-good'}">${emptyFolders > 0 ? `${emptyFolders} 个` : '无'}</span>
                  </div>
                  <div class="stats-health-row">
                    <span class="stats-health-label">最大文件夹</span>
                    <span class="stats-health-value stats-health-primary">${escapeHtml(largestFolder.title)}（${largestFolder.count} 项）</span>
                  </div>
                </div>
              </div>
            `;
            toolsResultList.querySelectorAll('.stats-domain-fill').forEach((el) => {
              const pct = Math.max(0, Math.min(100, Number(el.dataset.fill || 0)));
              el.style.width = `${pct}%`;
            });
            document.getElementById('statusStats').textContent = `共 ${totalBookmarks} 个书签`;
            btn.disabled = false;
            btn.textContent = '重新分析';
          });
        });
      });
    }

    if (btnFindBrokenLinks) {
      btnFindBrokenLinks.addEventListener('click', () => {
        openToolView('检查失效链接');
        toolDetailStatus.style.display = 'flex';
        setToolDetailStatusText('状态：尚未扫描');
        toolDetailMainAction.innerHTML = `<button id="btnStartCheckBroken" class="tool-btn tool-btn-primary">开始检测</button>`;
        toolDetailWarning.style.display = 'block';
        toolDetailWarning.innerHTML = '⚠️ 新策略：优先用 HEAD 探测并分级重试；无法高置信判定的条目会标记为“待复核”，避免误删。';

        document.getElementById('btnStartCheckBroken').addEventListener('click', async (e) => {
          const btn = e.target;
          btn.className = 'tool-btn tool-btn-primary';
          btn.disabled = true;
          btn.textContent = '处理中...';
          toolDetailStatus.style.display = 'flex';
          setToolDetailStatusText('运行中：正在收集所有链接...');
          setToolsResultMessage('处理中...');

          if (!toolsModule || !toolsModule.runBrokenLinkScan || !toolsModule.collectHttpLinks) {
            setToolDetailStatusText('状态：工具模块未加载，无法执行检测', 'error');
            setToolsResultMessage('请刷新扩展后重试', 'error');
            btn.disabled = false;
            btn.textContent = '重新检测';
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
            btn.textContent = '重新检测';
            btn.className = 'tool-btn tool-btn-secondary';
          };

          getBookmarkTreeCached(async (tree) => {
            const links = toolsModule.collectHttpLinks(tree);
            let completedCount = 0;
            const totalCount = links.length;

            if (totalCount === 0) {
              setToolDetailStatusText('扫描完成：未发现有效 HTTP(S) 链接需要检测。', 'success');
              toolsResultList.innerHTML = '';
              toolDetailFooter.style.display = 'none';
              setScanIdle();
              if (brokenLinkScanSession === scanSession) brokenLinkScanSession = null;
              return;
            }

            setToolDetailStatusText(`运行中：已找到 ${totalCount} 个链接，准备探测。这可能需要一分钟。`);
            toolsResultList.innerHTML = '';
            toolDetailFooter.style.display = 'flex';
            toolDetailFooter.style.justifyContent = 'center';
            toolDetailFooter.innerHTML = `<button id="btnCancelBrokenScan" class="tool-btn tool-btn-secondary">取消检测</button>`;
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
                setToolDetailStatusText(`检测已取消（${completedCount}/${totalCount}）`, 'warning');
                setToolsResultMessage('已取消本次检测');
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
                  setToolDetailStatusText(`运行中：正在探测 ${completed}/${total}...`);
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
              const suffix = cacheHits > 0 ? `（缓存复用 ${cacheHits} 条）` : '';
              setToolDetailStatusText(`扫描完成：${totalCount} 个链接均可访问。${suffix}`, 'success');
              setToolsResultMessage('🎉 全部链接均正常！');
              document.getElementById('statusBrokenLinks').textContent = '上次扫描：未发现死链';
              toolDetailFooter.style.display = 'none';
              setScanIdle();
              if (brokenLinkScanSession === scanSession) brokenLinkScanSession = null;
              return;
            }

            if (brokenLinks.length > 0) {
              const suffix = cacheHits > 0 ? `（缓存复用 ${cacheHits} 条）` : '';
              setToolDetailStatusText(`扫描完成：确认失效 ${brokenLinks.length} 条，待复核 ${uncertainLinks.length} 条。${suffix}`, 'warning', true);
            } else {
              const suffix = cacheHits > 0 ? `（缓存复用 ${cacheHits} 条）` : '';
              setToolDetailStatusText(`扫描完成：未发现高置信失效链接，待复核 ${uncertainLinks.length} 条。${suffix}`, 'warning', true);
            }
            document.getElementById('statusBrokenLinks').textContent = `上次扫描：${brokenLinks.length} 确认失效 / ${uncertainLinks.length} 待复核`;

            let html = '';
            if (brokenLinks.length > 0) {
              html += `<div class="tool-check-group-title">确认失效（高置信）</div>`;
              html += `<div class="tool-check-group">`;
              brokenLinks.forEach((b) => {
                const reason = getBrokenProbeReasonLabel(b.probe);
                html += `<div class="tool-check-item">
                          <input type="checkbox" class="broken-checkbox" data-id="${b.node.id}" checked>
                          <span class="tool-check-label" title="${escapeHtml(b.node.url)}">❌ ${escapeHtml(b.node.title || '无标题')}</span>
                         </div>
                         <div class="tool-check-url tool-check-url-error">${escapeHtml(b.node.url)}<br>[${escapeHtml(reason)}]</div>`;
              });
              html += `</div>`;
            }
            if (uncertainLinks.length > 0) {
              html += `<div class="tool-check-group-title">待复核（可能受跨域、防爬、网络波动影响）</div>`;
              html += `<div class="tool-check-group tool-check-group-dashed">`;
              uncertainLinks.forEach((u) => {
                const reason = getBrokenProbeReasonLabel(u.probe);
                html += `<div class="tool-check-item">
                          <input type="checkbox" class="broken-checkbox" data-id="${u.node.id}">
                          <span class="tool-check-label" title="${escapeHtml(u.node.url)}">⚠️ ${escapeHtml(u.node.title || '无标题')}</span>
                         </div>
                         <div class="tool-check-url tool-check-url-warn">${escapeHtml(u.node.url)}<br>[${escapeHtml(reason)}]</div>`;
              });
              html += `</div>`;
            }

            toolDetailFooter.style.display = 'flex';
            toolDetailFooter.style.justifyContent = 'center';
            toolDetailFooter.innerHTML = `<button id="btnCleanBrokenLinks" class="tool-btn tool-btn-danger">清理选中项</button>`;
            toolsResultList.innerHTML = html;
            setScanIdle();
            if (brokenLinkScanSession === scanSession) brokenLinkScanSession = null;

            document.getElementById('btnCleanBrokenLinks').addEventListener('click', async (eClean) => {
              const checkboxes = toolsResultList.querySelectorAll('.broken-checkbox:checked');
              if (checkboxes.length === 0) return;
              if (!(await confirmDangerAction(
                `确定删除选中的 ${checkboxes.length} 条链接吗？`,
                {
                  okText: '删除',
                  hint: brokenLinks.length === 0 ? '当前均为待复核条目，建议先手动确认后再删除。'
                    : '已包含高置信失效条目，仍建议在删除前快速复核。'
                }
              ))) return;
              eClean.target.className = 'tool-btn tool-btn-danger';
              eClean.target.disabled = true;
              eClean.target.textContent = '清理中...';
              setToolDetailStatusText('处理中：正在移除选中项...');
              let promises = Array.from(checkboxes).map(cb => {
                return new Promise(res => chrome.bookmarks.remove(cb.getAttribute('data-id'), res));
              });
              Promise.all(promises).then(() => {
                document.getElementById('btnStartCheckBroken').click();
                refreshView();
              });
            });
          });
        });
      });
    }

    if (btnCleanEmptyFolders) {
      btnCleanEmptyFolders.addEventListener('click', () => {
        openToolView('清理空文件夹');
        toolDetailStatus.style.display = 'flex';
        setToolDetailStatusText('状态：尚未分析');
        toolDetailMainAction.innerHTML = `<button id="btnStartCleanEmpty" class="tool-btn tool-btn-primary">开始扫描</button>`;
        toolDetailWarning.style.display = 'block';
        toolDetailWarning.innerHTML = '💡 提示：扫描并永久清理内部不含有任何书签、也没有有效子文件夹的空壳结构。';

        document.getElementById('btnStartCleanEmpty').addEventListener('click', (e) => {
          const btn = e.target;
          btn.className = 'tool-btn tool-btn-primary';
          btn.disabled = true;
          btn.textContent = '处理中...';
          toolDetailStatus.style.display = 'flex';
          setToolDetailStatusText('运行中：正在扫描结构...');
          setToolsResultMessage('处理中...');

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
              setToolDetailStatusText('扫描完成：未发现任何空文件夹。', 'success');
              setToolsResultMessage('🎉 您的书签库非常整洁！');
              document.getElementById('statusEmptyFolders').textContent = '上次扫描：0 个空壳';
              btn.disabled = false;
              btn.textContent = '重新扫描';
              btn.className = 'tool-btn tool-btn-secondary';
              return;
            }

            setToolDetailStatusText(`扫描完成：发现 ${emptyFolders.length} 个空壳文件夹。`, 'warning', true);
            document.getElementById('statusEmptyFolders').textContent = `上次扫描：${emptyFolders.length} 个空壳`;

            let html = `<div class="tool-check-group">`;
            emptyFolders.forEach((node) => {
              html += `<div class="tool-check-item">
                        <input type="checkbox" class="empty-folder-checkbox" data-id="${node.id}" checked>
                        <span class="tool-check-label" title="${escapeHtml(node.title)}">📁 ${escapeHtml(node.title || '未命名')}</span>
                       </div>`;
            });
            html += `</div>`;

            toolDetailFooter.style.display = 'flex';
            toolDetailFooter.style.justifyContent = 'center';
            toolDetailFooter.innerHTML = `<button id="btnCleanFolders" class="tool-btn tool-btn-danger">清理选中项</button>`;
            toolsResultList.innerHTML = html;
            btn.disabled = false;
            btn.textContent = '重新扫描';
            btn.className = 'tool-btn tool-btn-secondary';

            document.getElementById('btnCleanFolders').addEventListener('click', async (eClean) => {
              const checkboxes = toolsResultList.querySelectorAll('.empty-folder-checkbox:checked');
              if (checkboxes.length === 0) return;
              if (!(await confirmDangerAction(`确定删除选中的 ${checkboxes.length} 个空文件夹吗？`, { okText: '删除' }))) return;
              eClean.target.className = 'tool-btn tool-btn-danger';
              eClean.target.disabled = true;
              eClean.target.textContent = '清理中...';
              setToolDetailStatusText('处理中：正在移除选中项...');
              let promises = Array.from(checkboxes).map(cb => {
                return new Promise(res => chrome.bookmarks.removeTree(cb.getAttribute('data-id'), res));
              });
              Promise.all(promises).then(() => {
                document.getElementById('btnStartCleanEmpty').click(); // Run again in case parent became empty
                refreshView();
              });
            });
          });
        });
      });
    }

    if (btnBatchReplaceUrl) {
      btnBatchReplaceUrl.addEventListener('click', () => {
        openToolView('批量替换 URL');

        // 隐藏默认操作区和状态区，使用自定义的流程式布局
        toolDetailMainAction.style.display = 'none';
        toolDetailStatus.style.display = 'none';

        toolsResultList.innerHTML = `
          <!-- 规则配置区 -->
          <div id="urlReplaceRuleArea" class="url-replace-rule-area">
            <div class="url-replace-title">查找与替换规则</div>
            <input type="text" id="urlFindTarget" placeholder="查找内容 (例如: old-domain.com)" class="search-input url-replace-input" spellcheck="false" autocomplete="off">
            <input type="text" id="urlReplaceTarget" placeholder="替换为 (留空表示删除匹配内容)" class="search-input url-replace-input" spellcheck="false" autocomplete="off">
            <div class="url-replace-scope">作用范围：所有书签 URL</div>
            
            <button id="btnStartUrlPreview" class="tool-btn tool-btn-primary url-replace-preview-btn" disabled>执行预演</button>
          </div>

          <!-- 动态状态区 -->
          <div id="urlStatusArea" class="url-status-area">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="url-status-icon"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
            <div>
              <div class="url-status-heading">操作提示</div>
              <div id="urlStatusText" class="url-status-text">请在上方输入查找内容和替换内容，然后点击"执行预演"</div>
            </div>
          </div>

          <!-- 预演结果展示区 -->
          <div id="urlPreviewArea" class="url-preview-area is-hidden"></div>
        `;

        toolDetailWarning.style.display = 'block';
        toolDetailWarning.innerHTML = '⚠️ <strong>风险提示：</strong> 正式替换不可撤销，请先执行预演并仔细确认结果。';

        const ruleArea = document.getElementById('urlReplaceRuleArea');
        const findInput = document.getElementById('urlFindTarget');
        const replaceInput = document.getElementById('urlReplaceTarget');
        const previewBtn = document.getElementById('btnStartUrlPreview');
        const statusArea = document.getElementById('urlStatusArea');
        const statusText = document.getElementById('urlStatusText');
        const previewArea = document.getElementById('urlPreviewArea');

        // 监听输入，控制预演按钮状态
        findInput.addEventListener('input', () => {
          if (findInput.value.trim().length > 0) {
            previewBtn.disabled = false;
            statusText.style.color = 'var(--text-secondary)';
            statusText.innerHTML = '已输入查找规则，点击"执行预演"查看将要被替换的链接。';
          } else {
            previewBtn.disabled = true;
            statusText.style.color = 'var(--text-secondary)';
            statusText.innerHTML = '请在上方输入查找内容和替换内容，然后点击"执行预演"';
          }
        });

        previewBtn.addEventListener('click', () => {
          const findStr = findInput.value;
          const replaceStr = replaceInput.value;

          if (!findStr) return;

          // 预演中状态
          findInput.disabled = true;
          replaceInput.disabled = true;
          previewBtn.disabled = true;
          previewBtn.textContent = '正在扫描...';
          statusArea.style.color = 'var(--text-secondary)';
          statusArea.innerHTML = '<div class="url-inline-spinner"><svg class="spin-icon" viewBox="0 0 24 24" fill="none" width="14" height="14" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> 正在预演替换结果...</div>';
          previewArea.style.display = 'none';
          toolDetailFooter.style.display = 'none';

          // 模拟稍微的延迟体现扫描过程
          setTimeout(() => {
            getBookmarkTreeCached((tree) => {
              let matches = [];
              function traverse(nodes) {
                nodes.forEach(node => {
                  if (node.url && node.url.includes(findStr)) {
                    matches.push({
                      node: node,
                      oldUrl: node.url,
                      newUrl: node.url.split(findStr).join(replaceStr)
                    });
                  }
                  if (node.children) traverse(node.children);
                });
              }
              traverse(tree);

              if (matches.length === 0) {
                // 无结果恢复状态
                findInput.disabled = false;
                replaceInput.disabled = false;
                previewBtn.disabled = false;
                previewBtn.textContent = '执行预演';
                statusArea.style.color = 'var(--text-secondary)';
                statusArea.innerHTML = '未找到可替换 URL';
                return;
              }

              // 预演完成，有结果
              ruleArea.style.display = 'none';
              statusArea.style.display = 'none';

              previewArea.style.display = 'flex';

              const maxPreview = 5;
              const previewMatches = matches.slice(0, maxPreview);

              let html = `<div class="url-preview-summary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" class="url-preview-summary-icon"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <div>
              <div class="url-preview-summary-title">扫描结果</div>
              <div class="url-preview-summary-text">找到 ${matches.length} 条可替换链接，请仔细确认以下变更记录：</div>
            </div>
          </div>`;

              html += `<div class="url-preview-title">预览样例 (前 ${previewMatches.length} 条)</div>`;
              html += `<div class="url-preview-list">`;

              previewMatches.forEach(m => {
                html += `
                  <div class="url-preview-item">
                    <div class="url-preview-item-title">${escapeHtml(m.node.title || '无标题')}</div>
                    <div class="url-preview-old">- ${escapeHtml(m.oldUrl)}</div>
                    <div class="url-preview-new">+ ${escapeHtml(m.newUrl)}</div>
                  </div>
                `;
              });

              if (matches.length > maxPreview) {
                html += `<div class="url-preview-more">...及其他 ${matches.length - maxPreview} 项</div>`;
              }
              html += `</div>`;
              previewArea.innerHTML = html;

              // 显示底部操作区
              toolDetailFooter.style.display = 'flex';
              toolDetailFooter.style.gap = '12px';
              toolDetailFooter.innerHTML = `
                <button id="btnEditRule" class="tool-btn tool-btn-secondary tool-flex-1">编辑规则</button>
                <button id="btnConfirmReplace" class="tool-btn tool-btn-danger tool-flex-2">确认替换 ${matches.length} 条</button>
              `;

              // 返回编辑
              document.getElementById('btnEditRule').addEventListener('click', () => {
                ruleArea.style.display = 'flex';
                findInput.disabled = false;
                replaceInput.disabled = false;
                previewBtn.disabled = false;
                previewBtn.textContent = '重新预演';

                statusArea.style.display = 'flex'; // Restore status area if needed or update text
                statusText.innerHTML = '已返回编辑模式，修改规则后可重新预演。';

                previewArea.style.display = 'none';
                toolDetailFooter.style.display = 'none';
              });

              // 确认执行
              document.getElementById('btnConfirmReplace').addEventListener('click', async (eConfirm) => {
                const confirmBtn = eConfirm.target;
                const editBtn = document.getElementById('btnEditRule');
                if (!(await confirmDangerAction(`确定替换这 ${matches.length} 条 URL 吗？`, { okText: '替换' }))) return;

                confirmBtn.disabled = true;
                editBtn.disabled = true;
                confirmBtn.innerHTML = '<div class="url-inline-spinner"><svg class="spin-icon" viewBox="0 0 24 24" fill="none" width="14" height="14" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> 正在替换...</div>';

                statusArea.style.display = 'flex';
                statusArea.style.color = 'var(--text-secondary)';
                statusText.innerHTML = '正在执行替换...';

                let promises = matches.map(m => {
                  return new Promise(res => chrome.bookmarks.update(m.node.id, { url: m.newUrl }, res));
                });

                Promise.all(promises).then(() => {
                  statusArea.style.color = '#34c759';
                  statusText.innerHTML = `🎉 已成功替换 ${matches.length} 条 URL`;

                  document.getElementById('statusReplaceUrl').textContent = `上次替换：${matches.length} 项`;

                  // 替换完成后保留状态，按钮变为"完成"返回
                  confirmBtn.style.display = 'none';
                  editBtn.style.display = 'none';

                  const doneBtn = document.createElement('button');
                  doneBtn.className = 'tool-btn tool-btn-primary';
                  doneBtn.classList.add('tool-flex-1');
                  doneBtn.textContent = '完成并返回';
                  doneBtn.onclick = () => {
                    closeToolView();
                    refreshView();
                  };
                  toolDetailFooter.appendChild(doneBtn);

                  refreshView();
                });
              });
            });
          }, 300); // 300ms 模拟扫描时间，提升体验感
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
      throw new Error('导入模块未加载');
    }
    return bookmarkService;
  }

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const importService = getBookmarkImportService();
      toolDetailStatus.style.display = 'flex';
      setToolDetailStatusText('状态：正在读取导入文件...');
      setToolsResultMessage('正在解析文件...');

      const rawText = await importService.readFileAsText(file);
      const parsedNodes = importService.parseImportedHtmlBookmarks(rawText);
      const summary = importService.countImportableNodes(parsedNodes);

      if (summary.total === 0) {
        setToolDetailStatusText('状态：未检测到可导入的书签条目', 'warning');
        setToolsResultMessage('文件中没有可导入的数据');
        return;
      }

      const shouldImport = await confirmDangerAction(
        `将从 "${file.name}" 导入 ${summary.bookmarks} 个书签、${summary.folders} 个文件夹。`,
        {
          title: '确认导入书签',
          hint: '将自动创建一个导入文件夹，导入后可继续手动整理。',
          okText: '开始导入',
          variant: 'normal'
        }
      );
      if (!shouldImport) {
        setToolDetailStatusText('状态：已取消导入');
        toolsResultList.innerHTML = '';
        return;
      }

      const importParentId = await importService.getImportParentId(chrome);
      const baseName = (file.name || '书签').replace(/\.[^.]+$/, '').trim() || '书签';
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-');
      const importFolder = await importService.createBookmarkAsync(chrome, {
        parentId: importParentId,
        title: `Jade导入 · ${baseName} · ${stamp}`
      });

      const stats = {
        folders: 1, // 含导入根文件夹
        bookmarks: 0,
        skipped: 0,
        processed: 0,
        total: summary.total
      };

      setToolDetailStatusText('状态：正在导入 0%');
      await importService.importNodesRecursive(chrome, importFolder.id, parsedNodes, stats, (processed, total) => {
        const safeTotal = Math.max(total, 1);
        const pct = Math.min(100, Math.round((processed / safeTotal) * 100));
        setToolDetailStatusText(`状态：正在导入 ${pct}%（${processed}/${safeTotal}）`);
      });

      invalidateBookmarkTreeCache();
      refreshView();

      document.getElementById('statusImport').textContent = `上次导入：${stats.bookmarks} 书签 / ${stats.folders} 文件夹`;
      setToolDetailStatusText(`状态：导入完成（成功 ${stats.bookmarks + stats.folders} 项，跳过 ${stats.skipped} 项）`, 'success');
      toolsResultList.innerHTML = `
        <div class="import-summary-card">
          <div class="import-summary-title">导入目录：${escapeHtml(importFolder.title)}</div>
          <div class="import-summary-meta">
            成功导入书签：${stats.bookmarks}<br>
            成功导入文件夹：${stats.folders}<br>
            跳过条目：${stats.skipped}
          </div>
        </div>
      `;
    } catch (err) {
      setToolDetailStatusText(`状态：导入失败（${err.message || '未知错误'}）`, 'error');
      setToolsResultMessage('导入失败，请检查文件格式是否为标准 HTML 书签文件', 'error');
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
      }, () => {
        URL.revokeObjectURL(url);
        setToolDetailStatusText('状态：导出成功', 'success');
        setToolsResultMessage(`导出任务已提交 (${dateStr})`);
        if (btn) {
          btn.disabled = false;
          btn.textContent = '重新导出';
          btn.className = 'tool-btn tool-btn-secondary';
        }
      });
    });
  }
});

