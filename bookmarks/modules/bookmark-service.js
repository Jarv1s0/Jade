(function initBookmarkService(global) {
  'use strict';

  const i18n = global.JadeI18n || null;
  const t = (key, params, fallback) => (
    i18n && typeof i18n.t === 'function'
      ? i18n.t(key, params, fallback)
      : (fallback || key)
  );

  function createTreeCache(chromeApi) {
    const cache = { data: null, inFlight: null, generation: 0 };

    function invalidate() {
      cache.data = null;
      cache.inFlight = null;
      cache.generation++;
    }

    function setupInvalidation(onInvalidated) {
      let importInProgress = false;
      const notifyInvalidated = () => {
        invalidate();
        if (!importInProgress && typeof onInvalidated === 'function') {
          onInvalidated();
        }
      };
      const mutationEvents = [
        chromeApi.bookmarks.onCreated,
        chromeApi.bookmarks.onRemoved,
        chromeApi.bookmarks.onChanged,
        chromeApi.bookmarks.onMoved,
        chromeApi.bookmarks.onChildrenReordered
      ];
      mutationEvents.forEach((eventObj) => {
        if (eventObj && eventObj.addListener) eventObj.addListener(notifyInvalidated);
      });

      if (chromeApi.bookmarks.onImportBegan && chromeApi.bookmarks.onImportBegan.addListener) {
        chromeApi.bookmarks.onImportBegan.addListener(() => {
          importInProgress = true;
          invalidate();
        });
      }
      if (chromeApi.bookmarks.onImportEnded && chromeApi.bookmarks.onImportEnded.addListener) {
        chromeApi.bookmarks.onImportEnded.addListener(() => {
          importInProgress = false;
          notifyInvalidated();
        });
      }
    }

    function getTreeCached(callback, options) {
      const opts = options || {};
      const forceRefresh = !!opts.forceRefresh;
      const runCallback = (tree, error = null) => {
        if (typeof callback === 'function') {
          callback(Array.isArray(tree) ? tree : null, error);
        }
      };

      if (!forceRefresh && cache.data) {
        runCallback(cache.data);
        return;
      }

      if (!forceRefresh && cache.inFlight) {
        cache.inFlight.then((result) => {
          if (result !== null) runCallback(result.tree, result.error);
        });
        return;
      }

      const requestGeneration = cache.generation;
      const request = new Promise((resolve) => {
        chromeApi.bookmarks.getTree((tree) => {
          if (chromeApi.runtime && chromeApi.runtime.lastError) {
            resolve({
              tree: null,
              error: new Error(chromeApi.runtime.lastError.message || 'Failed to read bookmark tree')
            });
            return;
          }
          if (!Array.isArray(tree)) {
            resolve({ tree: null, error: new Error('Bookmark tree response is invalid') });
            return;
          }
          resolve({ tree, error: null });
        });
      });

      const currentRequest = request.then((result) => {
        if (requestGeneration !== cache.generation) return null;
        if (!result.error) cache.data = result.tree;
        return result;
      }).finally(() => {
        if (cache.inFlight === currentRequest) cache.inFlight = null;
      });
      cache.inFlight = currentRequest;

      currentRequest.then((result) => {
        if (result !== null) runCallback(result.tree, result.error);
      });
    }

    return {
      invalidate,
      setupInvalidation,
      getTreeCached
    };
  }

  function findBookmarkNodePath(tree, targetId) {
    const expectedId = String(targetId || '');
    if (!expectedId) return [];

    function walk(nodes, path) {
      for (const node of (Array.isArray(nodes) ? nodes : [])) {
        if (!node || node.url) continue;
        const nextPath = node.id === '0' ? path : path.concat(node);
        if (String(node.id) === expectedId) return nextPath;
        const found = walk(node.children, nextPath);
        if (found.length > 0) return found;
      }
      return [];
    }

    return walk(tree, []);
  }

  function isFolderPinKey(value) {
    return typeof value === 'string'
      && (value.startsWith('folder:')
        || value.startsWith('folder-v2:')
        || value.startsWith('folder-id:'));
  }

  function mergeSyncedAndLocalPinLists(primary, local) {
    const synced = Array.from(new Set(Array.isArray(primary) ? primary : []));
    const localList = Array.isArray(local) ? local : [];
    let syncedIndex = 0;
    const merged = [];
    localList.forEach((entry) => {
      if (isFolderPinKey(entry)) {
        merged.push(entry);
      } else if (syncedIndex < synced.length) {
        merged.push(synced[syncedIndex++]);
      }
    });
    while (syncedIndex < synced.length) merged.push(synced[syncedIndex++]);
    return Array.from(new Set(merged));
  }

  function mergeSyncedAndLocalPreferenceMaps(primary, local) {
    const merged = { ...((primary && typeof primary === 'object') ? primary : {}) };
    Object.entries((local && typeof local === 'object') ? local : {}).forEach(([key, value]) => {
      if (isFolderPinKey(key)) merged[key] = value;
    });
    return merged;
  }

  function buildFolderPinMetadata(tree) {
    const idToPinKey = new Map();
    const legacyAliases = new Map();
    const aliasesByPinKey = new Map();
    const normalize = (value) => String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
    const addAlias = (alias, stableKey) => {
      if (!alias || alias === stableKey) return;
      const targets = legacyAliases.get(alias) || [];
      if (!targets.includes(stableKey)) targets.push(stableKey);
      legacyAliases.set(alias, targets);
      const aliases = aliasesByPinKey.get(stableKey) || [];
      if (!aliases.includes(alias)) aliases.push(alias);
      aliasesByPinKey.set(stableKey, aliases);
    };

    function walk(nodes, parentSegments) {
      const list = Array.isArray(nodes) ? nodes : [];
      list.forEach((node) => {
        if (!node || node.url) return;
        if (node.id === '0') {
          walk(node.children, parentSegments);
          return;
        }

        const baseSegment = normalize(node.title);
        const pathSegments = parentSegments.concat(baseSegment);
        const stableKey = `folder-id:${encodeURIComponent(String(node.id))}`;
        idToPinKey.set(String(node.id), stableKey);

        const legacySegments = pathSegments.filter(Boolean);
        if (legacySegments.length > 0) {
          const legacyKey = `folder:${legacySegments.join('/')}`;
          addAlias(legacyKey, stableKey);
        }
        walk(node.children, pathSegments);
      });
    }

    walk(tree, []);
    return { idToPinKey, legacyAliases, aliasesByPinKey };
  }

  function buildFolderPinKeyMap(tree) {
    return buildFolderPinMetadata(tree).idToPinKey;
  }

  function migrateStoredPinList(list, idToPinKey, legacyPinKeyAliases) {
    const migrated = [];
    const seen = new Set();
    let changed = false;
    const isStablePinKey = (value) => typeof value === 'string'
      && (value.startsWith('url:')
        || value.startsWith('folder:')
        || value.startsWith('folder-v2:')
        || value.startsWith('folder-id:'));

    (Array.isArray(list) ? list : []).forEach((entry) => {
      let stableKeys = [];
      if (isStablePinKey(entry)) {
        stableKeys = legacyPinKeyAliases.get(entry) || [entry];
        if (stableKeys.length !== 1 || stableKeys[0] !== entry) changed = true;
      } else if (idToPinKey.has(String(entry))) {
        stableKeys = [idToPinKey.get(String(entry))];
        changed = true;
      } else {
        changed = true;
      }

      stableKeys.forEach((stableKey) => {
        if (!stableKey || seen.has(stableKey)) return;
        seen.add(stableKey);
        migrated.push(stableKey);
      });
    });

    return { value: migrated, changed };
  }

  function canReorderBookmarkList(options) {
    const opts = options || {};
    return !opts.isSearchResult && !opts.isUncategorized;
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file'));
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
            title: (linkEl.textContent || '').trim() || t('common.untitledBookmark', null, 'Untitled bookmark'),
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
        title: (folderTitleEl.textContent || '').trim() || t('common.untitledFolder', null, 'Untitled folder'),
        children: parseBookmarkDlElement(subDl)
      });
    }
    return items;
  }

  function parseImportedHtmlBookmarks(rawHtml) {
    const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
    const rootDl = doc.querySelector('dl');
    if (!rootDl) throw new Error('Unrecognized bookmark HTML (Netscape format expected)');
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

  function collectBookmarkFolders(tree) {
    const folders = [];

    function walk(nodes, parentTitles = [], depth = 0) {
      (Array.isArray(nodes) ? nodes : []).forEach((node) => {
        if (!node || node.url) return;

        const isRoot = node.id === '0';
        const title = String(node.title || '').trim() || t('common.untitledFolder', null, 'Untitled folder');
        const pathTitles = isRoot ? parentTitles : parentTitles.concat(title);
        if (!isRoot) {
          folders.push({
            id: String(node.id),
            title,
            path: pathTitles.join(' / '),
            depth
          });
        }

        walk(node.children, pathTitles, isRoot ? depth : depth + 1);
      });
    }

    walk(tree);
    return folders;
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
          await createBookmarkAsync(chromeApi, { parentId, title: node.title || t('common.untitledBookmark', null, 'Untitled bookmark'), url: node.url });
          stats.bookmarks++;
        } catch (_) {
          stats.skipped++;
        }
        stats.processed++;
        if (onProgress) onProgress(stats.processed, stats.total);
        continue;
      }

      try {
        const folder = await createBookmarkAsync(chromeApi, { parentId, title: node.title || t('common.untitledFolder', null, 'Untitled folder') });
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
    findBookmarkNodePath,
    isFolderPinKey,
    mergeSyncedAndLocalPinLists,
    mergeSyncedAndLocalPreferenceMaps,
    buildFolderPinMetadata,
    buildFolderPinKeyMap,
    migrateStoredPinList,
    canReorderBookmarkList,
    readFileAsText,
    parseImportedHtmlBookmarks,
    countImportableNodes,
    collectBookmarkFolders,
    createBookmarkAsync,
    getImportParentId,
    importNodesRecursive
  };
})(window);
