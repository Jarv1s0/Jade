document.addEventListener('DOMContentLoaded', function () {
  // Elements
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

  // Footer Buttons
  const btnManageBookmarksBtn = document.getElementById('btnManageBookmarksBtn');
  const openToolboxBtn = document.getElementById('btnToolsMain');

  // Tools Modal
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

  // Context Menu and Edit Modal
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

  const importFileInput = document.getElementById('importFileInput');

  // Drag and Drop (Bookmark List)
  let draggedItem = null;
  let draggedItemId = null;

  // State
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

  // Detect OS for shortcut hint
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  if (shortcutHint) {
    shortcutHint.textContent = isMac ? '⌘K' : 'Ctrl K';
  }

  // --- INITIALIZATION ---
  init();

  function init() {
    // 载入置顶、黑名单、排序和自定义标题，然后构建首页
    chrome.storage.local.get(['pinned_bookmarks', 'frequent_order', 'frequent_custom_titles', 'frequent_custom_urls', 'hidden_recent_urls'], (res) => {
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

      chrome.bookmarks.get('1', (nodes) => {
        if (nodes && nodes.length > 0) {
          const bookmarkBar = nodes[0];
          navigationStack = [{ id: bookmarkBar.id, title: bookmarkBar.title || '书签栏' }];
          // Start by building the dashboard (Home view)
          buildDashboard();
        }
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

    if (openToolboxBtn) {
      openToolboxBtn.addEventListener('click', () => {
        toolsModal.style.display = 'flex';
        // 每次打开时，重置为菜单视图
        closeToolView();
      });
    }

    if (toolsCloseBtn) {
      toolsCloseBtn.addEventListener('click', () => {
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

  // --- DASHBOARD BUILDER (The Launcher View) ---
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
          <div class="empty-pinned-state" style="grid-column: span 4;">
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
          ? `<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" style="color:var(--text-tertiary)">
               <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
             </svg>`
          : `<img src="chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(item.url)}&size=128"
                  onerror="this.src='https://www.google.com/s2/favicons?domain=${domain}&sz=128'"
                  class="frequent-favicon">`;

        a.innerHTML = `
              <div class="frequent-actions" title="取消置顶">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--accent-color)" stroke="var(--accent-color)" stroke-width="2.5" style="opacity: 0; transform: rotate(45deg); transition: opacity 0.25s ease, fill 0.25s ease;"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
              </div>
              <div class="frequent-icon-wrap">
                  ${iconHtml}
              </div>
              <span class="frequent-title">${escapeHtml(shortName)}</span>
          `;

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

        // Click on pin icon directly (Remove from pinned)
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

        // Right click context menu
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

    chrome.bookmarks.getTree((tree) => {
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
            <div class="empty-state" style="padding: 16px; color: var(--text-tertiary); text-align: center; border-radius: 8px; background: var(--bg-hover);">
              暂无最近访问记录
            </div>
          `;
          return;
        }

        combined.forEach(item => {
          const a = document.createElement('a');
          a.className = 'recent-item';
          a.href = '#';
          
          // 右键菜单
          a.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            targetNodeDomain = item.url; // 借用 domain 存储 url 或 id 以供后续移除动作
            showContextMenu(e, false, false, true);
          });

            const domain = new URL(item.url || 'about:blank').hostname;

            const timeAgo = getTimeAgo(item.timestamp || Date.now());
            const metaInfo = item.type === '历史记录' ? timeAgo : `${item.type} · ${timeAgo}`;

            a.innerHTML = `
                <div class="recent-favicon">
                  <img src="chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(item.url)}&size=32"
                       onerror="this.src='https://www.google.com/s2/favicons?domain=${domain}&sz=32'">
                </div>
                <div class="recent-info">
                  <div class="recent-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
                  <div class="recent-meta">${escapeHtml(metaInfo)}</div>
                </div>
            `;

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

    chrome.bookmarks.getTree((tree) => {
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

  // --- STANDARD FOLDER NAVIGATION ---
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
      chrome.bookmarks.getTree((tree) => {
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
    backBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 2px;"><polyline points="15 18 9 12 15 6"></polyline></svg> 返回`;
    
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
                if (!chrome.runtime.lastError && currentFolderId) loadStandardFolder(currentFolderId);
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
                  if (!chrome.runtime.lastError && currentFolderId) loadStandardFolder(currentFolderId);
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
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style="color:var(--text-tertiary)">
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

      const metaSpan = item.meta ? `<span class="recent-meta" style="margin-left: 8px;">${item.meta}</span>` : '';

      a.innerHTML = `
        ${iconHtml}
        <div class="bookmark-info" style="flex-direction:row; align-items:center;">
          <span class="bookmark-title" style="${isFolder ? 'font-weight:500;' : ''}">${titleHtml}</span>
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

  // --- CONTEXT MENU & MODALS ---
  function showContextMenu(e, isFolder, isFrequent = false, isRecent = false) {
    const activeId = targetNodeId || targetNodeDomain;

    if (menuPin) {
      if (isRecent) {
        menuPin.style.display = 'none';
      } else {
        menuPin.style.display = 'block';
        menuPin.textContent = pinnedIds.has(activeId) ? '从我的置顶移除' : '添加到我的置顶';
      }
    }

    if (menuSortName) menuSortName.style.display = isFolder && !isRecent ? 'block' : 'none';
    if (menuSortTime) menuSortTime.style.display = isFolder && !isRecent ? 'block' : 'none';

    // 常用访问卡片或普通书签：编辑显示。最近访问：不显示
    if (menuEdit) menuEdit.style.display = ((targetNodeId || isFrequent) && !isRecent) ? 'block' : 'none';
    if (menuDelete) menuDelete.style.display = (targetNodeId && !isRecent) ? 'block' : 'none';

    if (menuAddToGroup) menuAddToGroup.style.display = isRecent ? 'block' : 'none';
    if (menuRemoveRecent) menuRemoveRecent.style.display = isRecent ? 'block' : 'none';
    if (menuDivider1) menuDivider1.style.display = isRecent ? 'none' : 'block';

    let x = e.clientX;
    let y = e.clientY;
    const menuWidth = 140;
    const menuHeight = isFolder ? 160 : (isFrequent ? 120 : 100);

    if (x + menuWidth > document.body.clientWidth) x -= menuWidth;
    if (y + menuHeight > document.body.clientHeight) y -= menuHeight;

    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
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

    menuDelete.addEventListener('click', () => {
      if (!targetNodeId) return;
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

  // --- TOOLBOX LOGIC (Drill-down View Navigation) ---
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
        toolDetailStatus.innerHTML = '<span style="color:var(--text-secondary)">状态：等待选择文件</span>';

        toolDetailMainAction.innerHTML = `<button id="btnSelectImportFile" class="tool-btn tool-btn-primary">选择文件</button>`;
        toolDetailWarning.style.display = 'block';
        toolDetailWarning.innerHTML = '⚠️ 导入的书签将合并到当前系统中。由于未完全适配所有格式，当前仅支持特定 JSON 格式，导入过程可能导致意外错误。';

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
        toolDetailStatus.innerHTML = '<span style="color:var(--text-secondary)">状态：准备导出</span>';

        toolDetailMainAction.innerHTML = `<button id="btnExecuteExport" class="tool-btn tool-btn-primary">立即导出</button>`;
        toolDetailWarning.style.display = 'block';
        toolDetailWarning.innerHTML = '💡 提示：导出书签将把当前所有书签及目录结构备份为一个标准 HTML 文件，可用于在其他浏览器中恢复。';

        document.getElementById('btnExecuteExport').addEventListener('click', (e) => {
          e.target.className = 'tool-btn tool-btn-primary';
          e.target.disabled = true;
          e.target.textContent = '处理中...';
          toolDetailStatus.innerHTML = '<span style="color:var(--text-secondary)">状态：正在生成...</span>';
          handleExportBookmarks(e.target);
        });
      });
    }

    // 1. 扫描重复书签
    if (btnFindDuplicates) {
      btnFindDuplicates.addEventListener('click', () => {
        openToolView('扫描重复');
        toolDetailStatus.style.display = 'flex';
        toolDetailStatus.innerHTML = '<span style="color:var(--text-secondary)">状态：尚未扫描</span>';

        toolDetailMainAction.innerHTML = `<button id="btnStartFindDuplicates" class="tool-btn tool-btn-primary">开始扫描</button>`;
        toolDetailWarning.style.display = 'block';
        toolDetailWarning.innerHTML = '💡 提示：基于完全相同的 URL 来判断重复。批量清理重复项后将不可撤销退回，请谨慎操作。';

        document.getElementById('btnStartFindDuplicates').addEventListener('click', (e) => {
          const btn = e.target;
          btn.className = 'tool-btn tool-btn-primary';
          btn.disabled = true;
          btn.textContent = '处理中...';
          toolDetailStatus.style.display = 'flex';
          toolDetailStatus.innerHTML = '<span style="color:var(--text-secondary)">运行中：正在扫描整个书签库...</span>';
          toolsResultList.innerHTML = '<div style="color:var(--text-tertiary); padding:16px; text-align:center;">处理中...</div>';

          chrome.bookmarks.getTree((tree) => {
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
              toolDetailStatus.innerHTML = '<span style="color:#34c759">扫描完成：未发现任何重复的书签。</span>';
              toolsResultList.innerHTML = '<div style="text-align:center; padding: 20px;">🎉 您的书签库非常整洁！</div>';
              document.getElementById('statusDuplicates').textContent = '上次扫描：0 项重复';
              btn.disabled = false;
              btn.textContent = '重新扫描';
              btn.className = 'tool-btn tool-btn-secondary';
              return;
            }

            toolDetailStatus.innerHTML = `<span style="color:#d97706; font-weight:bold;">扫描完成：共发现 ${duplicateGroups.length} 组重复链接。</span>`;
            document.getElementById('statusDuplicates').textContent = `上次扫描：${duplicateGroups.length} 组重复`;

            let html = '';
            duplicateGroups.forEach(group => {
              html += `<div style="margin-bottom: 12px; border:1px solid var(--border-color); padding: 8px; border-radius: 6px; background: var(--bg-surface);">
                                    <div style="font-size:11px; margin-bottom: 8px; word-break: break-all; color: var(--text-tertiary);">${escapeHtml(group.url)}</div>`;
              group.nodes.forEach((node, nIdx) => {
                const shouldCheck = nIdx > 0;
                html += `<div style="display:flex; align-items:center; margin-bottom:6px; gap:8px;">
                                        <input type="checkbox" class="duplicate-checkbox" data-id="${node.id}" ${shouldCheck ? 'checked' : ''}>
                                        <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px;" title="${escapeHtml(node.title)}">${escapeHtml(node.title || '无标题')}</span>
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

            document.getElementById('btnCleanDuplicates').addEventListener('click', (eClean) => {
              const checkboxes = toolsResultList.querySelectorAll('.duplicate-checkbox:checked');
              if (checkboxes.length === 0) return;
              eClean.target.className = 'tool-btn tool-btn-danger';
              eClean.target.disabled = true;
              eClean.target.textContent = '清理中...';
              toolDetailStatus.innerHTML = '<span style="color:var(--text-secondary)">处理中：正在移除选中项...</span>';
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
        toolDetailStatus.innerHTML = '<span style="color:var(--text-secondary)">状态：尚未分析</span>';

        toolDetailMainAction.innerHTML = `<button id="btnStartStats" class="tool-btn tool-btn-primary">开始分析</button>`;
        toolDetailWarning.style.display = 'block';
        toolDetailWarning.innerHTML = '💡 提示：全面统计书签库的层级结构与健康度，并生成域名的分布榜单，分析过程完全在本地进行。';

        document.getElementById('btnStartStats').addEventListener('click', (e) => {
          const btn = e.target;
          btn.className = 'tool-btn tool-btn-primary';
          btn.disabled = true;
          btn.textContent = '处理中...';
          toolDetailStatus.innerHTML = '<span style="color:var(--text-secondary)">运行中：正在收集数据...</span>';

          chrome.bookmarks.getTree((tree) => {
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
                <div style="display:flex; align-items:center; gap:8px; font-size:12px; height:26px;">
                  <span style="width:18px; text-align:right; color:var(--text-tertiary); flex-shrink:0;">${idx + 1}</span>
                  <div style="flex:1; min-width:0; display:flex; align-items:center; gap:8px;">
                    <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px; color:var(--text-primary);">${escapeHtml(domain)}</span>
                    <div style="flex:1; height:4px; background:var(--bg-hover); border-radius:2px; overflow:hidden;">
                      <div style="width:${pct}%; height:100%; background:var(--accent-color); border-radius:2px;"></div>
                    </div>
                  </div>
                  <span style="color:var(--text-tertiary); flex-shrink:0;">${count}</span>
                </div>`;
            });

            // 结构健康度
            const healthColor = (duplicateCount + emptyFolders) === 0 ? '#34c759' : '#d97706';
            const healthIcon = (duplicateCount + emptyFolders) === 0 ? '✅' : '⚠️';

            toolDetailStatus.innerHTML = '<span style="color:#34c759">分析完成</span>';
            toolsResultList.innerHTML = `
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:16px;">
                <div style="background:var(--bg-base); border-radius:8px; padding:14px 8px; text-align:center; border:1px solid var(--border-color);">
                  <div style="font-size:28px; font-weight:600; color:var(--text-primary);">${totalBookmarks}</div>
                  <div style="font-size:11px; color:var(--text-tertiary); margin-top:4px;">书签总数</div>
                </div>
                <div style="background:var(--bg-base); border-radius:8px; padding:14px 8px; text-align:center; border:1px solid var(--border-color);">
                  <div style="font-size:28px; font-weight:600; color:var(--text-primary);">${totalFolders}</div>
                  <div style="font-size:11px; color:var(--text-tertiary); margin-top:4px;">文件夹总数</div>
                </div>
                <div style="background:var(--bg-base); border-radius:8px; padding:14px 8px; text-align:center; border:1px solid var(--border-color);">
                  <div style="font-size:28px; font-weight:600; color:var(--text-primary);">${maxDepth}</div>
                  <div style="font-size:11px; color:var(--text-tertiary); margin-top:4px;">最深层级</div>
                </div>
                <div style="background:var(--bg-base); border-radius:8px; padding:14px 8px; text-align:center; border:1px solid var(--border-color);">
                  <div style="font-size:28px; font-weight:600; color:${emptyFolders > 0 ? '#d97706' : 'var(--text-primary)'};">${emptyFolders}</div>
                  <div style="font-size:11px; color:var(--text-tertiary); margin-top:4px;">空文件夹</div>
                </div>
              </div>

              <div style="margin-bottom:16px;">
                <div style="font-size:12px; font-weight:500; color:var(--text-secondary); margin-bottom:10px; letter-spacing:0.2px;">域名分布 Top 10</div>
                <div style="background:var(--bg-base); border-radius:8px; padding:12px 14px; border:1px solid var(--border-color); display:flex; flex-direction:column; gap:6px;">
                  ${domainHtml || '<div style="font-size:12px; color:var(--text-tertiary); text-align:center; padding:8px;">暂无数据</div>'}
                </div>
              </div>

              <div>
                <div style="font-size:12px; font-weight:500; color:var(--text-secondary); margin-bottom:10px; letter-spacing:0.2px;">结构健康度</div>
                <div style="background:var(--bg-base); border-radius:8px; padding:12px 14px; border:1px solid var(--border-color); display:flex; flex-direction:column; gap:10px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
                    <span style="color:var(--text-secondary);">重复链接</span>
                    <span style="font-weight:500; color:${duplicateCount > 0 ? '#d97706' : '#34c759'};">${duplicateCount > 0 ? duplicateCount + ' 组' : '无'}</span>
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
                    <span style="color:var(--text-secondary);">空文件夹</span>
                    <span style="font-weight:500; color:${emptyFolders > 0 ? '#d97706' : '#34c759'};">${emptyFolders > 0 ? emptyFolders + ' 个' : '无'}</span>
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
                    <span style="color:var(--text-secondary);">最大文件夹</span>
                    <span style="font-weight:500; color:var(--text-primary);">${escapeHtml(largestFolder.title)}（${largestFolder.count} 项）</span>
                  </div>
                </div>
              </div>
            `;
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
        toolDetailStatus.innerHTML = '<span style="color:var(--text-secondary)">状态：尚未扫描</span>';
        toolDetailMainAction.innerHTML = `<button id="btnStartCheckBroken" class="tool-btn tool-btn-primary">开始检测</button>`;
        toolDetailWarning.style.display = 'block';
        toolDetailWarning.innerHTML = '⚠️ 扫描数以千计的书签可能会产生网络开销，请耐心等待。部分网站设置了防爬机制可能产生误判。';

        document.getElementById('btnStartCheckBroken').addEventListener('click', async (e) => {
          const btn = e.target;
          btn.className = 'tool-btn tool-btn-primary';
          btn.disabled = true;
          btn.textContent = '处理中...';
          toolDetailStatus.style.display = 'flex';
          toolDetailStatus.innerHTML = '<span style="color:var(--text-secondary)">运行中：正在收集所有链接...</span>';
          toolsResultList.innerHTML = '<div style="color:var(--text-tertiary); padding:16px; text-align:center;">处理中...</div>';

          chrome.bookmarks.getTree(async (tree) => {
            let links = [];
            function traverse(nodes) {
              nodes.forEach(node => {
                if (node.url && (node.url.startsWith('http://') || node.url.startsWith('https://'))) {
                  links.push(node);
                }
                if (node.children) traverse(node.children);
              });
            }
            traverse(tree);

            if (links.length === 0) {
              toolDetailStatus.innerHTML = '<span style="color:#34c759">扫描完成：未发现有效 HTTP(S) 链接需要检测。</span>';
              toolsResultList.innerHTML = '';
              btn.disabled = false;
              btn.textContent = '重新检测';
              return;
            }

            toolDetailStatus.innerHTML = `<span style="color:var(--text-secondary)">运行中：已找到 ${links.length} 个链接，准备探测。这可能需要一分钟。</span>`;
            toolsResultList.innerHTML = '';
            const brokenLinks = [];

            const concurrencyLimit = 5;
            let currentIndex = 0;
            let completedCount = 0;

            async function checkNext() {
              if (currentIndex >= links.length) return;
              const idx = currentIndex++;
              const node = links[idx];

              try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 6000);
                await fetch(node.url, { method: 'HEAD', mode: 'no-cors', cache: 'no-cache', signal: controller.signal });
                clearTimeout(timeoutId);
              } catch (err) {
                brokenLinks.push({ node, error: err.message });
              }

              completedCount++;
              if (completedCount % 10 === 0 || completedCount === links.length) {
                toolDetailStatus.innerHTML = `<span style="color:var(--text-secondary)">运行中：正在探测 ${completedCount}/${links.length}...</span>`;
              }

              await checkNext();
            }

            let workers = [];
            for (let i = 0; i < concurrencyLimit; i++) {
              workers.push(checkNext());
            }

            await Promise.all(workers);

            if (brokenLinks.length === 0) {
              toolDetailStatus.innerHTML = `<span style="color:#34c759">扫描完成：${links.length} 个链接均可访问。</span>`;
              toolsResultList.innerHTML = '<div style="text-align:center; padding: 20px;">🎉 全部链接均正常！</div>';
              document.getElementById('statusBrokenLinks').textContent = '上次扫描：未发现死链';
              btn.disabled = false;
              btn.textContent = '重新检测';
              btn.className = 'tool-btn tool-btn-secondary';
              return;
            }

            toolDetailStatus.innerHTML = `<span style="color:#d97706; font-weight:bold;">扫描完成：发现 ${brokenLinks.length} 个失效链接。</span>`;
            document.getElementById('statusBrokenLinks').textContent = `上次扫描：${brokenLinks.length} 个死链`;

            let html = `<div style="margin-bottom: 12px; border:1px solid var(--border-color); padding: 8px; border-radius: 6px; background: var(--bg-surface);">`;
            brokenLinks.forEach(b => {
              html += `<div style="display:flex; align-items:center; margin-bottom:6px; gap:8px;">
                        <input type="checkbox" class="broken-checkbox" data-id="${b.node.id}" checked>
                        <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px;" title="${escapeHtml(b.node.url)}">❌ ${escapeHtml(b.node.title || '无标题')}</span>
                       </div>
                       <div style="font-size:11px; color:#ff3b30; margin-left: 24px; margin-bottom: 8px; word-break: break-all;">${escapeHtml(b.node.url)}<br>[Error: ${escapeHtml(b.error || 'Failed to fetch')}]</div>`;
            });
            html += `</div>`;

            toolDetailFooter.style.display = 'flex';
            toolDetailFooter.style.justifyContent = 'center';
            toolDetailFooter.innerHTML = `<button id="btnCleanBrokenLinks" class="tool-btn tool-btn-danger">清理选中项</button>`;
            toolsResultList.innerHTML = html;
            btn.disabled = false;
            btn.textContent = '重新检测';
            btn.className = 'tool-btn tool-btn-secondary';

            document.getElementById('btnCleanBrokenLinks').addEventListener('click', (eClean) => {
              const checkboxes = toolsResultList.querySelectorAll('.broken-checkbox:checked');
              if (checkboxes.length === 0) return;
              eClean.target.className = 'tool-btn tool-btn-danger';
              eClean.target.disabled = true;
              eClean.target.textContent = '清理中...';
              toolDetailStatus.innerHTML = '<span style="color:var(--text-secondary)">处理中：正在移除选中项...</span>';
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
        toolDetailStatus.innerHTML = '<span style="color:var(--text-secondary)">状态：尚未分析</span>';
        toolDetailMainAction.innerHTML = `<button id="btnStartCleanEmpty" class="tool-btn tool-btn-primary">开始扫描</button>`;
        toolDetailWarning.style.display = 'block';
        toolDetailWarning.innerHTML = '💡 提示：扫描并永久清理内部不含有任何书签、也没有有效子文件夹的空壳结构。';

        document.getElementById('btnStartCleanEmpty').addEventListener('click', (e) => {
          const btn = e.target;
          btn.className = 'tool-btn tool-btn-primary';
          btn.disabled = true;
          btn.textContent = '处理中...';
          toolDetailStatus.style.display = 'flex';
          toolDetailStatus.innerHTML = '<span style="color:var(--text-secondary)">运行中：正在扫描结构...</span>';
          toolsResultList.innerHTML = '<div style="color:var(--text-tertiary); padding:16px; text-align:center;">处理中...</div>';

          chrome.bookmarks.getTree((tree) => {
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
              toolDetailStatus.innerHTML = '<span style="color:#34c759">扫描完成：未发现任何空文件夹。</span>';
              toolsResultList.innerHTML = '<div style="text-align:center; padding: 20px;">🎉 您的书签库非常整洁！</div>';
              document.getElementById('statusEmptyFolders').textContent = '上次扫描：0 个空壳';
              btn.disabled = false;
              btn.textContent = '重新扫描';
              btn.className = 'tool-btn tool-btn-secondary';
              return;
            }

            toolDetailStatus.innerHTML = `<span style="color:#d97706; font-weight:bold;">扫描完成：发现 ${emptyFolders.length} 个空壳文件夹。</span>`;
            document.getElementById('statusEmptyFolders').textContent = `上次扫描：${emptyFolders.length} 个空壳`;

            let html = `<div style="margin-bottom: 12px; border:1px solid var(--border-color); padding: 8px; border-radius: 6px; background: var(--bg-surface);">`;
            emptyFolders.forEach((node) => {
              html += `<div style="display:flex; align-items:center; margin-bottom:6px; gap:8px;">
                        <input type="checkbox" class="empty-folder-checkbox" data-id="${node.id}" checked>
                        <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px;" title="${escapeHtml(node.title)}">📁 ${escapeHtml(node.title || '未命名')}</span>
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

            document.getElementById('btnCleanFolders').addEventListener('click', (eClean) => {
              const checkboxes = toolsResultList.querySelectorAll('.empty-folder-checkbox:checked');
              if (checkboxes.length === 0) return;
              eClean.target.className = 'tool-btn tool-btn-danger';
              eClean.target.disabled = true;
              eClean.target.textContent = '清理中...';
              toolDetailStatus.innerHTML = '<span style="color:var(--text-secondary)">处理中：正在移除选中项...</span>';
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
          <div id="urlReplaceRuleArea" style="display:flex; flex-direction:column; gap:12px; margin-bottom:16px;">
            <div style="font-size:13px; font-weight:500; color:var(--text-primary);">查找与替换规则</div>
            <input type="text" id="urlFindTarget" placeholder="查找内容 (例如: old-domain.com)" class="search-input" spellcheck="false" autocomplete="off" style="font-size:13px; padding:10px 12px;">
            <input type="text" id="urlReplaceTarget" placeholder="替换为 (留空表示删除匹配内容)" class="search-input" spellcheck="false" autocomplete="off" style="font-size:13px; padding:10px 12px;">
            <div style="font-size:12px; color:var(--text-tertiary); margin-top:2px;">作用范围：所有书签 URL</div>
            
            <button id="btnStartUrlPreview" class="tool-btn tool-btn-primary" style="margin-top:8px;" disabled>执行预演</button>
          </div>

          <!-- 动态状态区 -->
          <div id="urlStatusArea" style="font-size:13px; padding:12px; border-radius:8px; background:var(--bg-hover); color:var(--text-secondary); margin-bottom:16px; display:flex; align-items:flex-start; gap:8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-top:2px; color:var(--accent-color);"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
            <div>
              <div style="font-weight:500; color:var(--text-primary); margin-bottom:4px;">操作提示</div>
              <div id="urlStatusText" style="line-height:1.4;">请在上方输入查找内容和替换内容，然后点击"执行预演"</div>
            </div>
          </div>

          <!-- 预演结果展示区 -->
          <div id="urlPreviewArea" style="display:none; flex-direction:column; gap:8px;"></div>
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
          statusArea.innerHTML = '<div style="display:flex; align-items:center; gap:8px;"><svg class="spin-icon" viewBox="0 0 24 24" fill="none" width="14" height="14" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> 正在预演替换结果...</div>';
          previewArea.style.display = 'none';
          toolDetailFooter.style.display = 'none';

          // 模拟稍微的延迟体现扫描过程
          setTimeout(() => {
            chrome.bookmarks.getTree((tree) => {
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

              let html = `<div style="font-size:13px; padding:12px; border-radius:8px; background:var(--bg-hover); color:var(--text-secondary); margin-bottom:16px; display:flex; align-items:flex-start; gap:8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" style="flex-shrink:0; margin-top:2px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <div>
              <div style="font-weight:600; color:#d97706; margin-bottom:4px;">扫描结果</div>
              <div style="line-height:1.4;">找到 ${matches.length} 条可替换链接，请仔细确认以下变更记录：</div>
            </div>
          </div>`;

              html += `<div style="font-size:12px; font-weight:500; color:var(--text-primary); margin-bottom:4px;">预览样例 (前 ${previewMatches.length} 条)</div>`;
              html += `<div style="background:var(--bg-base); border-radius:6px; border:1px solid var(--border-color); padding:12px; display:flex; flex-direction:column; gap:12px;">`;

              previewMatches.forEach(m => {
                html += `
                  <div style="font-size:12px; display:flex; flex-direction:column; gap:4px;">
                    <div style="font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-primary);">${escapeHtml(m.node.title || '无标题')}</div>
                    <div style="color:#ff3b30; text-decoration:line-through; word-break:break-all; opacity:0.8;">- ${escapeHtml(m.oldUrl)}</div>
                    <div style="color:#34c759; word-break:break-all; font-weight:500;">+ ${escapeHtml(m.newUrl)}</div>
                  </div>
                `;
              });

              if (matches.length > maxPreview) {
                html += `<div style="font-size:12px; color:var(--text-tertiary); text-align:center; padding-top:4px; border-top:1px dashed var(--border-color);">...及其他 ${matches.length - maxPreview} 项</div>`;
              }
              html += `</div>`;
              previewArea.innerHTML = html;

              // 显示底部操作区
              toolDetailFooter.style.display = 'flex';
              toolDetailFooter.style.gap = '12px';
              toolDetailFooter.innerHTML = `
                <button id="btnEditRule" class="tool-btn tool-btn-secondary" style="flex:1;">编辑规则</button>
                <button id="btnConfirmReplace" class="tool-btn tool-btn-danger" style="flex:2;">确认替换 ${matches.length} 条</button>
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
              document.getElementById('btnConfirmReplace').addEventListener('click', (eConfirm) => {
                const confirmBtn = eConfirm.target;
                const editBtn = document.getElementById('btnEditRule');

                confirmBtn.disabled = true;
                editBtn.disabled = true;
                confirmBtn.innerHTML = '<div style="display:flex; align-items:center; gap:8px;"><svg class="spin-icon" viewBox="0 0 24 24" fill="none" width="14" height="14" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> 正在替换...</div>';

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
                  doneBtn.style.flex = '1';
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
  function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        alert('导入功能正在适配中...');
        toolDetailStatus.innerHTML = '<span style="color:#34c759">状态：导入适配中</span>';
      } catch (err) {
        alert('导入失败：格式错误');
        toolDetailStatus.innerHTML = '<span style="color:#ff3b30">状态：导入失败（格式错误）</span>';
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // --- EXPORT HANDLE (HTML) ---
  function handleExportBookmarks(btn) {
    chrome.bookmarks.getTree((tree) => {
      let htmlContent = `< !DOCTYPE NETSCAPE - Bookmark - file - 1 >
< !--This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -- >
      <META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
        <TITLE>Bookmarks</TITLE>
        <H1>Bookmarks</H1>
        <DL><p>
          `;
      function traverseNode(node) {
        if (node.title === "" && !node.children) return; // Skip dummy roots if any
        if (node.url) {
          const addDate = node.dateAdded ? Math.floor(node.dateAdded / 1000) : 0;
          htmlContent += `    <DT><A HREF="${node.url}" ADD_DATE="${addDate}">${escapeHtml(node.title)}</A>\n`;
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
        toolDetailStatus.innerHTML = '<span style="color:#34c759">状态：导出成功</span>';
        toolsResultList.innerHTML = `<div style="color:var(--text-secondary); padding:16px; text-align:center;">导出任务已提交 (${dateStr})</div>`;
        if (btn) {
          btn.disabled = false;
          btn.textContent = '重新导出';
          btn.className = 'tool-btn tool-btn-secondary';
        }
      });
    });
  }
});