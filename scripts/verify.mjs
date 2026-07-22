import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
assert.match(String(manifest.version || ''), /^\d+(?:\.\d+){0,2}$/, 'manifest version must be a numeric extension version');
assert.ok(
  Array.isArray(manifest.optional_host_permissions) && manifest.optional_host_permissions.includes('<all_urls>'),
  'broken-link scans must declare optional website access'
);
assert.ok(
  !Array.isArray(manifest.host_permissions) || !manifest.host_permissions.includes('<all_urls>'),
  'website access must not be granted automatically at install time'
);

const workflow = fs.readFileSync('.github/workflows/package.yml', 'utf8');
assert.ok(!workflow.includes('github.event.inputs.version'), 'release workflow must use manifest.json as the version source');
assert.ok(workflow.includes('release/build.ps1'), 'release workflow must reuse the local packaging script');
assert.ok(workflow.includes('npm run verify'), 'release workflow must run verification before packaging');
assert.match(workflow, /\bpush:/, 'pushes must run verification');
assert.match(workflow, /\bpull_request:/, 'pull requests must run verification');
assert.ok(workflow.includes("if: github.event_name == 'workflow_dispatch'"), 'packaging must remain manual-only');

const readme = fs.readFileSync('README.md', 'utf8');
assert.ok(!readme.includes('Unsplash'), 'README wallpaper provider copy must match implemented providers');

const i18nSource = fs.readFileSync('shared/i18n.js', 'utf8');
assert.ok(!i18nSource.includes('自动创建书签备份'), 'tool warnings must not promise automatic backups');
assert.ok(!i18nSource.includes('A bookmark backup is created before'), 'tool warnings must not promise automatic backups in English');

const popupSource = fs.readFileSync('bookmarks/popup.js', 'utf8');
assert.ok(popupSource.includes('requestToken !== searchRequestToken'), 'stale search results must be ignored');
assert.ok(
  popupSource.includes('loadStandardFolder(currentNavigation.id, !!currentNavigation.isUncategorized)'),
  'clearing search must preserve virtual-folder navigation state'
);
assert.ok(
  popupSource.includes("if (!folder.isUncategorized) card.addEventListener('contextmenu'"),
  'the virtual uncategorized card must not expose real-folder actions'
);
assert.ok(popupSource.includes('showContextMenu(e, isFolder, true)'), 'pinned folders must open the folder context menu');
assert.ok(popupSource.includes("chrome.bookmarks.move(bookmarkId, { parentId }"), 'bookmarks must support moving to a selected folder');

const context = {
  window: {},
  console,
  URL
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('bookmarks/modules/tools.js', 'utf8'), context, {
  filename: 'bookmarks/modules/tools.js'
});
vm.runInContext(fs.readFileSync('bookmarks/modules/bookmark-service.js', 'utf8'), context, {
  filename: 'bookmarks/modules/bookmark-service.js'
});
vm.runInContext(fs.readFileSync('bookmarks/modules/context-menu.js', 'utf8'), context, {
  filename: 'bookmarks/modules/context-menu.js'
});
vm.runInContext(fs.readFileSync('bookmarks/modules/url-replace-tool.js', 'utf8'), context, {
  filename: 'bookmarks/modules/url-replace-tool.js'
});

class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length > 0 ? args : [2026, 6, 22, 12, 0, 0]));
  }
}

const providerContext = {
  window: {},
  console,
  URL,
  Date: FixedDate
};
vm.createContext(providerContext);
vm.runInContext(fs.readFileSync('newtab/modules/providers.js', 'utf8'), providerContext, {
  filename: 'newtab/modules/providers.js'
});

const tools = context.window.JadeModules?.tools;
const bookmarkService = context.window.JadeModules?.bookmarkService;
const contextMenu = context.window.JadeModules?.contextMenu;
assert.equal(typeof tools?.collectDuplicateUrlGroups, 'function', 'duplicate scan helper must be exported');
assert.equal(typeof tools?.collectLeafEmptyFolders, 'function', 'empty folder scan helper must be exported');
assert.equal(typeof tools?.analyzeBookmarkStats, 'function', 'stats helper must be exported');
assert.equal(typeof bookmarkService?.createTreeCache, 'function', 'bookmark tree cache helper must be exported');
assert.equal(typeof bookmarkService?.collectBookmarkFolders, 'function', 'bookmark folder collector must be exported');
assert.equal(typeof contextMenu?.resolveVisibility, 'function', 'context menu visibility helper must be exported');
assert.deepEqual(
  Object.keys(contextMenu.resolveVisibility({ isRecent: true, pinnedIds: new Set() })).sort(),
  ['pinText', 'showDelete', 'showDivider', 'showEdit', 'showMove', 'showPin', 'showRemoveRecent', 'showSortName', 'showSortTime'].sort(),
  'context menu visibility state must only expose implemented actions'
);
assert.equal(
  contextMenu.resolveVisibility({ targetNodeId: 'bookmark-1', isFolder: false, pinnedIds: new Set() }).showMove,
  true,
  'real bookmarks must expose the move-to-folder action'
);
assert.equal(
  contextMenu.resolveVisibility({ targetNodeId: 'folder-1', isFolder: true, pinnedIds: new Set() }).showMove,
  false,
  'folders must not expose the bookmark-only move action'
);

function createBookmarkEvent() {
  const listeners = [];
  return {
    addListener(listener) {
      listeners.push(listener);
    },
    emit() {
      listeners.forEach((listener) => listener());
    }
  };
}

const bookmarkEvents = {
  onCreated: createBookmarkEvent(),
  onRemoved: createBookmarkEvent(),
  onChanged: createBookmarkEvent(),
  onMoved: createBookmarkEvent(),
  onChildrenReordered: createBookmarkEvent(),
  onImportBegan: createBookmarkEvent(),
  onImportEnded: createBookmarkEvent()
};
const cacheChromeApi = {
  bookmarks: {
    ...bookmarkEvents,
    getTree(callback) {
      callback([{ id: '0', children: [] }]);
    }
  },
  runtime: {}
};
const treeCache = bookmarkService.createTreeCache(cacheChromeApi);
let refreshNotificationCount = 0;
treeCache.setupInvalidation(() => {
  refreshNotificationCount++;
});
bookmarkEvents.onMoved.emit();
assert.equal(refreshNotificationCount, 1, 'bookmark moves must notify the active view to refresh');
bookmarkEvents.onRemoved.emit();
assert.equal(refreshNotificationCount, 2, 'bookmark removals must notify the active view to refresh');
bookmarkEvents.onImportBegan.emit();
bookmarkEvents.onCreated.emit();
assert.equal(refreshNotificationCount, 2, 'bookmark imports must suppress intermediate refreshes');
bookmarkEvents.onImportEnded.emit();
assert.equal(refreshNotificationCount, 3, 'bookmark imports must refresh once after completion');

const pendingTreeCallbacks = [];
let pendingTreeRequestCount = 0;
const pendingChromeApi = {
  bookmarks: {
    ...bookmarkEvents,
    getTree(callback) {
      pendingTreeRequestCount++;
      pendingTreeCallbacks.push(callback);
    }
  },
  runtime: {}
};
const pendingTreeCache = bookmarkService.createTreeCache(pendingChromeApi);
pendingTreeCache.getTreeCached(() => {});
pendingTreeCache.invalidate();
pendingTreeCache.getTreeCached(() => {});
assert.equal(pendingTreeRequestCount, 2, 'cache invalidation must not reuse a pre-change tree request');
pendingTreeCallbacks.forEach((callback) => callback([{ id: '0', children: [] }]));

const sampleTree = [{
  id: '0',
  children: [
    {
      id: '1',
      children: [
        { id: 'a', title: 'A', url: 'https://example.com/a' },
        { id: 'b', title: 'B', url: 'https://example.com/a ' },
        { id: 'empty-root-child', title: 'Ignored root child', children: [] }
      ]
    },
    {
      id: 'folder',
      title: 'Folder',
      children: [
        { id: 'empty', title: 'Empty', children: [] },
        {
          id: 'not-empty',
          title: 'Not Empty',
          children: [
            { id: 'c', title: 'C', url: 'https://example.com/c' },
            { id: 'd', title: 'D', url: 'http://docs.example.com/d' },
            { id: 'e', title: '', url: 'ftp://files.example.com/e' }
          ]
        }
      ]
    }
  ]
}];

const duplicateGroups = tools.collectDuplicateUrlGroups(sampleTree);
assert.equal(duplicateGroups.length, 1);
assert.equal(duplicateGroups[0].url, 'https://example.com/a');
assert.equal(JSON.stringify(duplicateGroups[0].nodes.map((node) => node.id)), JSON.stringify(['a', 'b']));

const emptyFolders = tools.collectLeafEmptyFolders(sampleTree);
assert.equal(JSON.stringify(emptyFolders.map((node) => node.id)), JSON.stringify(['empty-root-child', 'empty']));

const bookmarkFolders = bookmarkService.collectBookmarkFolders(sampleTree);
assert.equal(
  JSON.stringify(bookmarkFolders.map((folder) => folder.id)),
  JSON.stringify(['1', 'empty-root-child', 'folder', 'empty', 'not-empty']),
  'folder picker must include real folders and exclude the virtual root and bookmarks'
);
assert.equal(bookmarkFolders.find((folder) => folder.id === 'not-empty').path, 'Folder / Not Empty');

const stats = tools.analyzeBookmarkStats(sampleTree);
assert.equal(stats.totalBookmarks, 5);
assert.equal(stats.totalFolders, 6);
assert.equal(stats.uniqueDomains, 3);
assert.equal(stats.uniqueUrls, 4);
assert.equal(stats.duplicateCount, 1);
assert.equal(stats.emptyFolders, 2);
assert.equal(stats.httpsCount, 3);
assert.equal(stats.httpCount, 1);
assert.equal(stats.otherProtocolCount, 1);
assert.equal(stats.rootLevelBookmarks, 2);
assert.equal(stats.untitledItems, 2);
assert.equal(stats.maxDepth, 3);
assert.equal(stats.averageBookmarksPerFolder, '0.8');
assert.equal(JSON.stringify(stats.topDomains[0]), JSON.stringify(['example.com', 3]));
assert.equal(stats.largestFolder.title, '');
assert.equal(stats.largestFolder.count, 3);

const urlReplaceTool = context.window.JadeModules?.urlReplaceTool;
assert.equal(typeof urlReplaceTool?.createUrlReplacementRule, 'function', 'url replace helper must be exported');
assert.equal(typeof urlReplaceTool?.updateBookmarkUrlIfCurrentAsync, 'function', 'conditional URL update helper must be exported');

const domainRule = urlReplaceTool.createUrlReplacementRule('old-domain\\.com', 'new-domain.com');
assert.equal(
  domainRule.apply('https://old-domain.com/docs?q=old-domain.com'),
  'https://new-domain.com/docs?q=new-domain.com'
);

const literalRule = urlReplaceTool.createUrlReplacementRule('/old/i', 'new');
assert.equal(literalRule.apply('https://example.com/OLD/old'), 'https://example.com/new/new');

const captureRule = urlReplaceTool.createUrlReplacementRule('https://([^/]+)\\.example\\.com', 'https://$1.example.org');
assert.equal(captureRule.apply('https://docs.example.com/a'), 'https://docs.example.org/a');
assert.equal(captureRule.apply('https://example.com/a'), null);

assert.throws(
  () => urlReplaceTool.createUrlReplacementRule('[', ''),
  /Invalid regular expression/,
  'invalid regular expressions must fail before preview'
);

let updatedUrl = '';
const currentUrlChromeApi = {
  bookmarks: {
    get(id, callback) {
      callback([{ id, url: 'https://old.example/path' }]);
    },
    update(id, changes, callback) {
      updatedUrl = changes.url;
      callback();
    }
  },
  runtime: {}
};
await urlReplaceTool.updateBookmarkUrlIfCurrentAsync(
  currentUrlChromeApi,
  'bookmark-1',
  'https://old.example/path',
  'https://new.example/path'
);
assert.equal(updatedUrl, 'https://new.example/path', 'unchanged preview URLs must be updated');

let staleUpdateCalled = false;
const staleUrlChromeApi = {
  bookmarks: {
    get(id, callback) {
      callback([{ id, url: 'https://externally-changed.example/path' }]);
    },
    update(id, changes, callback) {
      staleUpdateCalled = true;
      callback();
    }
  },
  runtime: {}
};
await assert.rejects(
  urlReplaceTool.updateBookmarkUrlIfCurrentAsync(
    staleUrlChromeApi,
    'bookmark-2',
    'https://old.example/path',
    'https://new.example/path'
  ),
  /changed after preview/,
  'URLs changed after preview must not be overwritten'
);
assert.equal(staleUpdateCalled, false, 'stale URL replacements must not call bookmarks.update');

const nasaRequestedDates = [];
const nasaResponses = [
  { ok: false, status: 500 },
  { ok: true, status: 200, payload: { media_type: 'video' } },
  {
    ok: true,
    status: 200,
    payload: {
      media_type: 'image',
      title: 'Image',
      explanation: 'Details',
      url: 'https://images.example/nasa.jpg'
    }
  },
  {
    ok: true,
    status: 200,
    payload: {
      media_type: 'image',
      title: 'Next Image',
      explanation: 'More details',
      url: 'https://images.example/nasa-next.jpg'
    }
  }
];
const createWallpaperProviders = providerContext.window.JadeNewtabProviders?.createWallpaperProviders;
assert.equal(typeof createWallpaperProviders, 'function', 'new tab wallpaper providers must be loadable');
const wallpaperProviders = createWallpaperProviders({
  constants: {
    NASA_API_ROOT: 'https://api.nasa.test/apod',
    BING_API_ROOT_EN: 'https://bing.test'
  },
  isZhLocale: false,
  containsCjk: () => false,
  getBingLocaleConfig: () => ({ apiRoot: 'https://bing.test', market: 'en-US' }),
  getBingVariantKey: () => 'en-US',
  fetchWithRetry: async (url) => {
    nasaRequestedDates.push(new URL(url).searchParams.get('date'));
    const response = nasaResponses.shift();
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.payload
    };
  },
  isRetryableStatus: () => false,
  nasaApiKeyManager: { getKey: () => 'test-key' },
  favoritesManager: { favorites: [], getRandomFavorite: () => null },
  historyManager: { isRecent: () => false },
  fetchImpl: async () => ({ ok: false }),
  consoleObject: console,
  screenObject: { width: 1920, height: 1080 },
  devicePixelRatio: 1
});
const nasaResult = await wallpaperProviders.get('nasa')();
assert.deepEqual(
  nasaRequestedDates,
  ['2026-07-22', '2026-07-21', '2026-07-20'],
  'NASA fallback requests must inspect consecutive dates without double increments'
);
assert.equal(nasaResult._dateStr, '20260720');
assert.equal(wallpaperProviders.getState()._nasaDateOffset, 2, 'NASA offset must match the successful fallback date');
const nextNasaResult = await wallpaperProviders.get('nasa')(true);
assert.equal(nasaRequestedDates.at(-1), '2026-07-19', 'forced NASA refresh must advance exactly one day');
assert.equal(nextNasaResult._dateStr, '20260719');
assert.equal(wallpaperProviders.getState()._nasaDateOffset, 3);

console.log('verify ok');
