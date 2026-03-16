(function initBookmarkService(global) {
  'use strict';

  function createTreeCache(chromeApi) {
    const cache = { data: null, inFlight: null };

    function invalidate() {
      cache.data = null;
    }

    function setupInvalidation() {
      const invalidateFn = () => invalidate();
      const events = [
        chromeApi.bookmarks.onCreated,
        chromeApi.bookmarks.onRemoved,
        chromeApi.bookmarks.onChanged,
        chromeApi.bookmarks.onMoved,
        chromeApi.bookmarks.onChildrenReordered,
        chromeApi.bookmarks.onImportBegan,
        chromeApi.bookmarks.onImportEnded
      ];
      events.forEach((eventObj) => {
        if (eventObj && eventObj.addListener) eventObj.addListener(invalidateFn);
      });
    }

    function getTreeCached(callback, options) {
      const opts = options || {};
      const forceRefresh = !!opts.forceRefresh;
      const runCallback = (tree) => {
        if (typeof callback === 'function') {
          callback(Array.isArray(tree) ? tree : []);
        }
      };

      if (!forceRefresh && cache.data) {
        runCallback(cache.data);
        return;
      }

      if (!forceRefresh && cache.inFlight) {
        cache.inFlight.then(runCallback);
        return;
      }

      const request = new Promise((resolve) => {
        chromeApi.bookmarks.getTree((tree) => {
          if (chromeApi.runtime && chromeApi.runtime.lastError) {
            resolve([]);
            return;
          }
          cache.data = tree;
          resolve(tree);
        });
      });

      cache.inFlight = request.finally(() => {
        if (cache.inFlight === request) cache.inFlight = null;
      });

      request.then(runCallback);
    }

    return {
      invalidate,
      setupInvalidation,
      getTreeCached
    };
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsText(file);
    });
  }

  function parseBookmarkDlElement(dlElement) {
    const items = [];
    if (!dlElement) return items;
    const children = Array.from(dlElement.children || []);
    for (let i = 0; i < children.length; i++) {
      const dt = children[i];
      if (!dt || (dt.tagName || '').toUpperCase() !== 'DT') continue;

      const linkEl = dt.querySelector(':scope > a');
      if (linkEl) {
        const url = (linkEl.getAttribute('href') || '').trim();
        if (url) {
          items.push({
            title: (linkEl.textContent || '').trim() || '未命名书签',
            url
          });
        }
        continue;
      }

      const folderTitleEl = dt.querySelector(':scope > h3');
      if (!folderTitleEl) continue;

      let subDl = dt.querySelector(':scope > dl');
      if (!subDl) {
        const nextEl = dt.nextElementSibling;
        if (nextEl && (nextEl.tagName || '').toUpperCase() === 'DL') subDl = nextEl;
      }

      items.push({
        title: (folderTitleEl.textContent || '').trim() || '未命名文件夹',
        children: parseBookmarkDlElement(subDl)
      });
    }
    return items;
  }

  function parseImportedHtmlBookmarks(rawHtml) {
    const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
    const rootDl = doc.querySelector('dl');
    if (!rootDl) throw new Error('未识别为标准书签 HTML（Netscape）文件');
    return parseBookmarkDlElement(rootDl);
  }

  function countImportableNodes(nodes) {
    const result = { folders: 0, bookmarks: 0, total: 0 };
    const walk = (items) => {
      (items || []).forEach((item) => {
        if (item.url) {
          result.bookmarks++;
          result.total++;
          return;
        }
        result.folders++;
        result.total++;
        if (Array.isArray(item.children) && item.children.length > 0) walk(item.children);
      });
    };
    walk(nodes || []);
    return result;
  }

  function countNodeWithDescendants(node) {
    if (!node) return 0;
    if (node.url) return 1;
    let count = 1;
    const children = Array.isArray(node.children) ? node.children : [];
    children.forEach((child) => {
      count += countNodeWithDescendants(child);
    });
    return count;
  }

  function createBookmarkAsync(chromeApi, payload) {
    return new Promise((resolve, reject) => {
      chromeApi.bookmarks.create(payload, (created) => {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          reject(new Error(chromeApi.runtime.lastError.message));
          return;
        }
        resolve(created);
      });
    });
  }

  function getImportParentId(chromeApi) {
    return new Promise((resolve) => {
      chromeApi.bookmarks.getTree((tree) => {
        try {
          const roots = tree && tree[0] && Array.isArray(tree[0].children) ? tree[0].children : [];
          const other = roots.find((r) => r.id === '2');
          if (other) {
            resolve(other.id);
            return;
          }
          const bar = roots.find((r) => r.id === '1');
          resolve(bar ? bar.id : '1');
        } catch (_) {
          resolve('1');
        }
      });
    });
  }

  async function importNodesRecursive(chromeApi, parentId, nodes, stats, onProgress) {
    for (const node of nodes) {
      if (!node) continue;

      if (node.url) {
        try {
          await createBookmarkAsync(chromeApi, { parentId, title: node.title || '未命名书签', url: node.url });
          stats.bookmarks++;
        } catch (_) {
          stats.skipped++;
        }
        stats.processed++;
        if (onProgress) onProgress(stats.processed, stats.total);
        continue;
      }

      try {
        const folder = await createBookmarkAsync(chromeApi, { parentId, title: node.title || '未命名文件夹' });
        stats.folders++;
        stats.processed++;
        if (onProgress) onProgress(stats.processed, stats.total);
        if (Array.isArray(node.children) && node.children.length > 0) {
          await importNodesRecursive(chromeApi, folder.id, node.children, stats, onProgress);
        }
      } catch (_) {
        const skipped = countNodeWithDescendants(node);
        stats.skipped += skipped;
        stats.processed += skipped;
        if (onProgress) onProgress(stats.processed, stats.total);
      }
    }
  }

  global.JadeModules = global.JadeModules || {};
  global.JadeModules.bookmarkService = {
    createTreeCache,
    readFileAsText,
    parseImportedHtmlBookmarks,
    countImportableNodes,
    createBookmarkAsync,
    getImportParentId,
    importNodesRecursive
  };
})(window);
