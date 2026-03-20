/**
 * New Tab — 核心脚本
 * 功能：多源壁纸（Bing/NASA/Picsum/渐变/无）、收藏轮播 + Google 搜索
 */

(function () {
  'use strict';

  const i18n = window.JadeI18n || null;
  const t = (key, params, fallback) => (
    i18n && typeof i18n.t === 'function'
      ? i18n.t(key, params, fallback)
      : (fallback || key)
  );
  const isZhLocale = !!(i18n && i18n.locale === 'zh_CN');

  if (i18n && typeof i18n.apply === 'function') {
    i18n.apply(document);
    i18n.setDocumentTitle('newtab.pageTitle', null, 'New Tab');
  }

  // =============================
  //  1. DOM 元素 & 常量
  // =============================
  const DOM = {
    bgImage: document.getElementById('bg-image'),
    bgOverlay: document.getElementById('bg-overlay'),
    copyright: document.getElementById('bg-copyright'),
    // ----- 设置与收藏面板元素 -----
    providerSelector: document.getElementById('provider-selector'),
    favBtn: document.getElementById('fav-btn'),
    refreshBtn: document.getElementById('refresh-btn'),
    refreshWrapper: document.getElementById('refresh-wrapper'),
    sourceMenu: document.getElementById('source-menu'),
    nasaApiPanel: document.getElementById('nasa-api-panel'),
    clearFavoritesBtn: document.getElementById('clear-favorites-btn'),
    nasaApiStatus: document.getElementById('nasa-api-status'),
    nasaApiConfigBtn: document.getElementById('nasa-api-config-btn'),
    nasaApiResetBtn: document.getElementById('nasa-api-reset-btn'),
    nasaApiModal: document.getElementById('nasa-api-modal'),
    nasaApiInput: document.getElementById('nasa-api-input'),
    nasaApiCloseBtn: document.getElementById('nasa-api-close'),
    nasaApiCancelBtn: document.getElementById('nasa-api-cancel'),
    nasaApiSaveBtn: document.getElementById('nasa-api-save'),
    storyCard: document.getElementById('story-card'),
    storyTitle: document.getElementById('story-title'),
    storyBody: document.getElementById('story-body'),
    storyClose: document.getElementById('story-close'),
    statusToast: document.getElementById('status-toast')
  };

  const CONSTANTS = {
    BING_API_ZH: 'https://bing.ee123.net/img/',
    BING_API_EN: 'https://global.bing.com/HPImageArchive.aspx',
    BING_API_ROOT_EN: 'https://www.bing.com',
    NASA_API_ROOT: 'https://api.nasa.gov/planetary/apod',
    DEFAULT_NASA_API_KEY: 'DEMO_KEY',
    CACHE_KEYS: {
      SETTINGS: 'newtab_settings',
      FAVORITES: 'newtab_favorites',
      FAVORITES_CURRENT: 'newtab_favorites_current',
      BING: 'newtab_cache_bing',
      NASA: 'newtab_cache_nasa',
      PICSUM: 'newtab_cache_picsum',
      CURRENT_WALLPAPER: 'newtab_current_wallpaper'
    },
    PREFERENCE_KEYS: {
      NASA_API_KEY: 'newtab_nasa_api_key'
    },
    TTL: {
      BING: 6 * 60 * 60 * 1000, // 6小时
      NASA: 12 * 60 * 60 * 1000 // 12小时
    },
    DEFAULT_SETTINGS: {
      provider: 'bing' // 'bing', 'nasa', 'picsum', 'favorites'
    },
    NETWORK: {
      REQUEST_TIMEOUT_MS: 9000,
      REQUEST_RETRIES: 2,
      REQUEST_RETRY_DELAY_MS: 350,
      IMAGE_TIMEOUT_MS: 12000,
      IMAGE_RETRIES: 1,
      IMAGE_RETRY_DELAY_MS: 300
    }
  };

  function getBingLocaleConfig() {
    if (isZhLocale) {
      return {
        mode: 'ee123',
        market: 'zh-CN'
      };
    }

    return {
      mode: 'official',
      market: 'en-US'
    };
  }

  function getBingVariantKey() {
    const config = getBingLocaleConfig();
    return `${config.mode}:${config.market}`;
  }

  function normalizeNasaApiKey(value) {
    const normalized = String(value || '').trim();
    return normalized || CONSTANTS.DEFAULT_NASA_API_KEY;
  }

  function maskApiKey(value) {
    const key = String(value || '').trim();
    if (!key) return CONSTANTS.DEFAULT_NASA_API_KEY;
    if (key.length <= 8) return key;
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  // 当前壁纸的元数据（用于收藏）
  let currentWallpaperData = null;
  let wallpaperRenderToken = 0;
  let statusToastTimer = 0;

  // =============================
  //  2. 基础存储与缓存工具
  // =============================
  const Storage = {
    async get(key, defaultValue = null) {
      if (!chrome?.storage?.local) return defaultValue;
      return new Promise(resolve => {
        chrome.storage.local.get(key, res => resolve(res[key] !== undefined ? res[key] : defaultValue));
      });
    },
    async set(key, value) {
      if (!chrome?.storage?.local) return;
      return new Promise(resolve => chrome.storage.local.set({ [key]: value }, resolve));
    }
  };

  const Cache = {
    async get(key, ttl) {
      const data = await Storage.get(key);
      if (data && Date.now() - data.timestamp < ttl) {
        return data.payload;
      }
      return null;
    },
    async set(key, payload) {
      await Storage.set(key, { payload, timestamp: Date.now() });
    }
  };

  const NasaApiKeyManager = {
    apiKey: CONSTANTS.DEFAULT_NASA_API_KEY,
    async load() {
      const storedKey = await Storage.get(CONSTANTS.PREFERENCE_KEYS.NASA_API_KEY, '');
      this.apiKey = normalizeNasaApiKey(storedKey);
    },
    getKey() {
      return normalizeNasaApiKey(this.apiKey);
    },
    isUsingDefault() {
      return this.getKey() === CONSTANTS.DEFAULT_NASA_API_KEY;
    },
    async save(value) {
      const normalized = normalizeNasaApiKey(value);
      this.apiKey = normalized;
      await Storage.set(
        CONSTANTS.PREFERENCE_KEYS.NASA_API_KEY,
        normalized === CONSTANTS.DEFAULT_NASA_API_KEY ? '' : normalized
      );
    },
    async reset() {
      await this.save('');
    }
  };

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function updateNasaApiKeyStatus() {
    if (DOM.nasaApiStatus) {
      DOM.nasaApiStatus.textContent = NasaApiKeyManager.isUsingDefault()
        ? t('newtab.nasaApi.usingDefault', { key: CONSTANTS.DEFAULT_NASA_API_KEY }, `当前使用默认 Key：${CONSTANTS.DEFAULT_NASA_API_KEY}`)
        : t('newtab.nasaApi.usingCustom', { key: maskApiKey(NasaApiKeyManager.getKey()) }, `当前使用自定义 Key：${maskApiKey(NasaApiKeyManager.getKey())}`);
    }

    if (DOM.nasaApiInput) {
      DOM.nasaApiInput.value = NasaApiKeyManager.isUsingDefault() ? '' : NasaApiKeyManager.getKey();
    }
  }

  function updateNasaApiVisibility() {
    const isVisible = SettingsManager.settings.provider === 'nasa';
    if (DOM.nasaApiPanel) {
      DOM.nasaApiPanel.hidden = !isVisible;
    }
    if (!isVisible) {
      closeNasaApiModal();
    }
  }

  function openNasaApiModal() {
    if (!DOM.nasaApiModal || !DOM.nasaApiPanel || DOM.nasaApiPanel.hidden) return;
    updateNasaApiKeyStatus();
    DOM.nasaApiModal.classList.add('open');
    if (DOM.nasaApiInput) {
      setTimeout(() => {
        DOM.nasaApiInput.focus();
        DOM.nasaApiInput.select();
      }, 0);
    }
  }

  function closeNasaApiModal() {
    if (!DOM.nasaApiModal) return;
    DOM.nasaApiModal.classList.remove('open');
  }

  async function refreshCurrentNasaWallpaper() {
    WallpaperProviders.resetNasaDateOffset();
    await Cache.set(CONSTANTS.CACHE_KEYS.CURRENT_WALLPAPER, null);
    if (SettingsManager.settings.provider === 'nasa') {
      await renderBackground(false);
    }
  }

  async function saveNasaApiKey(value) {
    await NasaApiKeyManager.save(value);
    updateNasaApiKeyStatus();
    closeNasaApiModal();
    await refreshCurrentNasaWallpaper();
  }

  function isRetryableStatus(status) {
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }

  async function fetchWithRetry(url, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : CONSTANTS.NETWORK.REQUEST_TIMEOUT_MS;
    const retries = Number.isFinite(options.retries) ? options.retries : CONSTANTS.NETWORK.REQUEST_RETRIES;
    const retryDelayMs = Number.isFinite(options.retryDelayMs) ? options.retryDelayMs : CONSTANTS.NETWORK.REQUEST_RETRY_DELAY_MS;
    const retryOnStatus = typeof options.retryOnStatus === 'function' ? options.retryOnStatus : isRetryableStatus;
    const fetchOptions = options.fetchOptions || {};
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          cache: 'no-store',
          redirect: 'follow',
          ...fetchOptions,
          signal: controller.signal
        });
        if (!res.ok && attempt < retries && retryOnStatus(res.status)) {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }
        return res;
      } catch (err) {
        lastError = err;
        if (attempt >= retries) break;
        await sleep(retryDelayMs * (attempt + 1));
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError || new Error('Fetch failed');
  }

  function preloadImage(url, timeoutMs = CONSTANTS.NETWORK.IMAGE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      let settled = false;
      const complete = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        if (err) reject(err);
        else resolve(url);
      };

      const timer = setTimeout(() => complete(new Error('Image timeout')), timeoutMs);
      img.onload = () => complete(null);
      img.onerror = () => complete(new Error('Image load error'));
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.src = url;
    });
  }

  async function preloadImageWithRetry(url, options = {}) {
    const retries = Number.isFinite(options.retries) ? options.retries : CONSTANTS.NETWORK.IMAGE_RETRIES;
    const retryDelayMs = Number.isFinite(options.retryDelayMs) ? options.retryDelayMs : CONSTANTS.NETWORK.IMAGE_RETRY_DELAY_MS;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : CONSTANTS.NETWORK.IMAGE_TIMEOUT_MS;
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await preloadImage(url, timeoutMs);
        return;
      } catch (err) {
        lastError = err;
        if (attempt >= retries) break;
        await sleep(retryDelayMs * (attempt + 1));
      }
    }

    throw lastError || new Error('Image preload failed');
  }

    // 防重复历史记录管理器 (最近观看的壁纸 URL，防止连续刷出同样的图)
  const HistoryManager = {
    history: [],
    maxSize: 15,
    async load() {
      this.history = await Storage.get('newtab_recent_history', []);
    },
    async add(url) {
      if (!url) return;
      this.history = this.history.filter(u => u !== url); // 移除旧的相同项
      this.history.unshift(url); // 放到最新
      if (this.history.length > this.maxSize) {
        this.history.pop();
      }
      await Storage.set('newtab_recent_history', this.history);
    },
    isRecent(url) {
      return this.history.includes(url);
    }
  };

  // =============================
  //  3. 核心管理器
  // =============================
  const SettingsManager = {
    settings: { ...CONSTANTS.DEFAULT_SETTINGS },
    async load() {
      const saved = await Storage.get(CONSTANTS.CACHE_KEYS.SETTINGS);
      if (saved) {
        this.settings = { ...this.settings, ...saved };
      }
    },
    async save() {
      await Storage.set(CONSTANTS.CACHE_KEYS.SETTINGS, this.settings);
    }
  };

  const FavoritesManager = {
        favorites: [], // 数组：{ id: string, url: string, copyright: string, provider: string }
    async load() {
      this.favorites = await Storage.get(CONSTANTS.CACHE_KEYS.FAVORITES, []);
    },
    async save() {
      await Storage.set(CONSTANTS.CACHE_KEYS.FAVORITES, this.favorites);
    },
    isFavorited(url) {
      return this.favorites.some(f => f.url === url);
    },
    async toggleFavorite(data) {
      if (!data || !data.url) return false;

      const index = this.favorites.findIndex(f => f.url === data.url);
      let isFav = false;

      if (index > -1) {
        this.favorites.splice(index, 1); // 移除收藏
      } else {
        this.favorites.push({
          id: Date.now().toString(),
          url: data.url,
          copyright: data.copyright || '',
          provider: data.provider || 'unknown'
        });
        isFav = true;
      }

      await this.save();
      // 这里需要通知 UI 更新收藏图标状态
      return isFav;
    },
    async clear() {
      this.favorites = [];
      await this.save();
      await Cache.set(CONSTANTS.CACHE_KEYS.FAVORITES_CURRENT, null);
    },
    getRandomFavorite() {
      if (this.favorites.length === 0) return null;
      const index = Math.floor(Math.random() * this.favorites.length);
      return this.favorites[index];
    }
  };

  // =============================
  //  4. 壁纸提供者 (Providers)
  // =============================
  const providerFactory = window.JadeNewtabProviders?.createWallpaperProviders;
  if (typeof providerFactory !== 'function') {
    throw new Error('New Tab providers module failed to load');
  }

  const WallpaperProviders = providerFactory({
    constants: CONSTANTS,
    isZhLocale,
    containsCjk: text => /[\u3400-\u9FFF]/.test(String(text || '')),
    getBingLocaleConfig,
    getBingVariantKey,
    fetchWithRetry,
    isRetryableStatus,
    nasaApiKeyManager: NasaApiKeyManager,
    favoritesManager: FavoritesManager,
    historyManager: HistoryManager,
    fetchImpl: window.fetch.bind(window),
    consoleObject: console,
    screenObject: window.screen,
    devicePixelRatio: window.devicePixelRatio
  });

  // =============================
  async function applyWallpaper(data, renderToken) {
    if (!data) return false;
    if (renderToken !== wallpaperRenderToken) return false;
    currentWallpaperData = data;

    // 清除可能存在的之前的图片层并重置淡入动画状态
    DOM.bgImage.classList.remove('loaded');
    DOM.bgImage.style.backgroundImage = 'none';
    DOM.bgImage.style.background = 'none';

    if (data.isGradient) {
      // 渲染渐变色
      DOM.bgImage.style.background = data.style;
      // 轻微降低 overlay 的透明度，让渐变更明亮
      DOM.bgOverlay.style.opacity = '0.3';
      DOM.bgImage.classList.add('loaded');
      updateCopyright(data.copyright);
      updateFavoriteButtonState();
      return true;
    } else {
      await preloadImageWithRetry(data.url);
      if (renderToken !== wallpaperRenderToken) return false;
      DOM.bgImage.style.backgroundImage = `url(${data.url})`;
      DOM.bgImage.style.backgroundSize = 'cover';
      DOM.bgOverlay.style.opacity = '1';
      DOM.bgImage.classList.add('loaded');
      updateCopyright(data.copyright);
      updateFavoriteButtonState();
      return true;
    }
  }

  async function fallbackToDefault() {
    // 终极兜底：清理背景图，显示为透明，让浏览器默认底色（根据操作系统的明暗主题自适应）展现
    DOM.bgImage.style.backgroundImage = 'none';
    DOM.bgImage.style.backgroundColor = 'transparent';
    DOM.bgImage.classList.add('loaded'); // 停止 pulse 动画
  }

  function updateCopyright(text) {
    if (DOM.copyright) {
      DOM.copyright.textContent = text ? (text.startsWith('©') || text.startsWith('🌅') || text.startsWith('☀️') || text.startsWith('🌇') || text.startsWith('🌙') ? text : `© ${text}`) : '';
    }
  }

  function updateFavoriteButtonState() {
    if (!currentWallpaperData) {
      DOM.favBtn.style.display = 'none';
      return;
    }
    DOM.favBtn.style.display = 'flex';
    const isFav = FavoritesManager.isFavorited(currentWallpaperData.url);
    if (isFav) {
      DOM.favBtn.classList.add('active');
      DOM.favBtn.title = t('newtab.unfavoriteWallpaper', null, 'Remove favorite');
    } else {
      DOM.favBtn.classList.remove('active');
      DOM.favBtn.title = t('newtab.favoriteWallpaper', null, 'Favorite this wallpaper');
    }
  }

  function hideStatusToast() {
    if (!DOM.statusToast) return;
    DOM.statusToast.classList.remove('open', 'warning', 'info');
    DOM.statusToast.textContent = '';
  }

  function showStatusToast(message, tone = 'info') {
    if (!DOM.statusToast || !message) return;

    window.clearTimeout(statusToastTimer);
    DOM.statusToast.textContent = message;
    DOM.statusToast.classList.remove('warning', 'info');
    DOM.statusToast.classList.add(tone, 'open');
    statusToastTimer = window.setTimeout(() => {
      hideStatusToast();
    }, 4200);
  }

  function sanitizeStoryDetail(html) {
    if (!html) return '';

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    doc.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach(el => el.remove());

    doc.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
          return;
        }

        if (name === 'href') {
          const href = el.getAttribute('href') || '';
          if (!/^https?:\/\//i.test(href)) {
            el.removeAttribute('href');
          }
          return;
        }

        el.removeAttribute(attr.name);
      });
    });

    return doc.body.innerHTML;
  }

  // =============================
  //  6. 执行引擎
  // =============================
  async function renderBackground(forceRefresh = false) {
    const renderToken = ++wallpaperRenderToken;
    const providerKey = SettingsManager.settings.provider;
    const shouldNotifyFavoritesFallback = providerKey === 'favorites' && FavoritesManager.favorites.length === 0;

    // 定义不同壁纸源的轮播/保持间隔毫秒数
    // Bing/NASA 是每日图，保持久一些（例如 6 小时）
    // picsum 和 favorites 旨在提供每次打开的新鲜感，我们设置短时间内打开不换，过 1-2 分钟就换。
    const TTL_MAP = {
      'bing': 6 * 60 * 60 * 1000,
      'nasa': 6 * 60 * 60 * 1000,
      'picsum': 0, // 每次新开标签页都切随机图
      'favorites': 0 // 每次新开标签页都随机抽一张收藏
    };
    const ttl = TTL_MAP[providerKey] !== undefined ? TTL_MAP[providerKey] : 1 * 60 * 60 * 1000;

    // 如果不是强刷，优先尝试读取全局当前的缓存，保证合适期限内的连续性
    if (!forceRefresh && ttl > 0) {
      const cached = await Cache.get(CONSTANTS.CACHE_KEYS.CURRENT_WALLPAPER, ttl);
      // 如果 Provider 切了或者存在，先使用它
      if (cached && cached.provider === providerKey) {
        const cacheMatchesBingVariant = providerKey !== 'bing' || cached._bingVariant === getBingVariantKey();

        // 对收藏检查是否被移除了
        if (cacheMatchesBingVariant && (providerKey !== 'favorites' || FavoritesManager.isFavorited(cached.url))) {
          // 恢复缓存对应的偏移量，防止新开标签页后点击刷新跳回最新天数
          WallpaperProviders.restoreState(cached);

          try {
            const applied = await applyWallpaper(cached, renderToken);
            if (applied) return;
          } catch (cacheErr) {
            console.warn('[NewTab] Cached wallpaper failed to load, fetching again:', cacheErr.message);
          }
        }
      }
    }

    const providerFn = WallpaperProviders.get(providerKey);

    try {
      const data = await providerFn(forceRefresh);
      const applied = await applyWallpaper(data, renderToken);
      if (!applied || renderToken !== wallpaperRenderToken) return;
      if (shouldNotifyFavoritesFallback && data.provider === 'bing') {
        showStatusToast(
          t(
            'newtab.notices.favoritesEmptyFallback',
            null,
            '当前还没有收藏壁纸，已自动回退到必应主页。'
          ),
          'info'
        );
      }
      // 新数据成功后，统一在此处写入持久化，并放入不重复历史名单。同时保存当下的日期偏移量。
      const cacheData = {
        ...data,
        ...WallpaperProviders.getState()
      };
      await Cache.set(CONSTANTS.CACHE_KEYS.CURRENT_WALLPAPER, cacheData);
      await HistoryManager.add(data.url);
    } catch (err) {
      console.warn(`[NewTab] Provider '${providerKey}' 失败:`, err.message);
      if (providerKey === 'nasa' && err.message === 'NASA Rate Limit Exceeded') {
        const messageKey = NasaApiKeyManager.isUsingDefault()
          ? 'newtab.notices.nasaRateLimitDefaultFallback'
          : 'newtab.notices.nasaRateLimitCustomFallback';
        const fallbackMessage = NasaApiKeyManager.isUsingDefault()
          ? 'NASA 默认 DEMO_KEY 已触发限流，已临时回退到必应。你可以稍后再试，或填写自己的 NASA API Key。'
          : '当前 NASA API Key 已触发限流，已临时回退到必应。你可以稍后再试或更换 Key。';
        showStatusToast(t(messageKey, null, fallbackMessage), 'warning');
      } else if (providerKey !== 'bing') {
        showStatusToast(
          t(
            'newtab.notices.providerFallbackGeneric',
            { provider: providerKey },
            '当前壁纸源暂时不可用，已自动回退到必应主页。'
          ),
          'warning'
        );
      }
      // 其他任何获取异常（如无网络、接口报错等）全部回退到必应（必应非常稳定）
      try {
        const data = await WallpaperProviders.get('bing')();
        const applied = await applyWallpaper(data, renderToken);
        if (!applied || renderToken !== wallpaperRenderToken) return;
      } catch (e) {
        if (renderToken === wallpaperRenderToken) {
          fallbackToDefault();
        }
      }
    }
  }

  // =============================
  //  7. 初始化入口
  // =============================
  async function init() {
    // 并行拉取用户配置和收藏列表以及历史记录
    await Promise.all([
      SettingsManager.load(),
      FavoritesManager.load(),
      HistoryManager.load(),
      NasaApiKeyManager.load()
    ]);
    updateNasaApiKeyStatus();
    updateNasaApiVisibility();
    // 开始渲染背景
    renderBackground();

    // 初始化设置面板 UI 状态
    const radios = DOM.providerSelector.querySelectorAll('input[type="radio"]');
    radios.forEach(radio => {
      if (radio.value === SettingsManager.settings.provider) {
        radio.checked = true;
      }
      radio.addEventListener('change', async (e) => {
        SettingsManager.settings.provider = e.target.value;
        await SettingsManager.save();
        updateNasaApiVisibility();
        // 切换来源时重置日期偏移量，确保显示最新壁纸
        WallpaperProviders.resetAllOffsets();
        await Cache.set(CONSTANTS.CACHE_KEYS.CURRENT_WALLPAPER, null);
        renderBackground(false);
      });
    });

    // 点击故事卡片外部区域关闭
    document.addEventListener('click', (e) => {
      // 点击故事卡片外部区域关闭
      if (DOM.storyCard.classList.contains('open') &&
        !DOM.storyCard.contains(e.target) &&
        !DOM.copyright.contains(e.target)) {
        DOM.storyCard.classList.remove('open');
      }

      if (DOM.refreshWrapper &&
        DOM.refreshWrapper.classList.contains('menu-open') &&
        !DOM.refreshWrapper.contains(e.target)) {
        DOM.refreshWrapper.classList.remove('menu-open');
      }
    });

    if (DOM.refreshWrapper) {
      DOM.refreshWrapper.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        DOM.refreshWrapper.classList.toggle('menu-open');
      });
    }

    // 壁纸故事卡片：点击版权文字展开/关闭
    DOM.copyright.addEventListener('click', () => {
      if (!currentWallpaperData) return;
      const detail = currentWallpaperData.detail || '';
      if (!detail && !currentWallpaperData.title) return; // 没有故事内容则不展开

      let fullTitle = '';
      if (currentWallpaperData.provider === 'bing') {
        const t = currentWallpaperData.title || '';
        const s = currentWallpaperData.show ? ` | ${currentWallpaperData.show}` : '';
        const c = currentWallpaperData.copyright ? ` (${currentWallpaperData.copyright.replace(/^(© )?/, '© ')})` : '';
        const d = currentWallpaperData._dateStr ? ` - ${currentWallpaperData._dateStr.replace(/(\d{4})(\d{2})(\d{2})/, '$1/$2/$3')}` : '';
        fullTitle = `${t}${s}${c}${d}`;
      } else {
        fullTitle = currentWallpaperData.title || currentWallpaperData.copyright || '';
      }

      DOM.storyTitle.textContent = fullTitle;
      DOM.storyBody.innerHTML = sanitizeStoryDetail(detail);
      DOM.storyCard.classList.toggle('open');
    });

    DOM.storyClose.addEventListener('click', (e) => {
      e.stopPropagation();
      DOM.storyCard.classList.remove('open');
    });

    // "回到今天" 按钮：重置 Bing/NASA 的日期偏移量
    const bingTodayBtn = document.getElementById('bing-today-btn');
    const nasaTodayBtn = document.getElementById('nasa-today-btn');

    if (bingTodayBtn) {
      bingTodayBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        WallpaperProviders.resetBingDateOffset();
        await Cache.set(CONSTANTS.CACHE_KEYS.CURRENT_WALLPAPER, null); // 清除缓存
        if (SettingsManager.settings.provider === 'bing') {
          await renderBackground(false);
        }
      });
    }

    if (nasaTodayBtn) {
      nasaTodayBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        WallpaperProviders.resetNasaDateOffset();
        await Cache.set(CONSTANTS.CACHE_KEYS.CURRENT_WALLPAPER, null);
        if (SettingsManager.settings.provider === 'nasa') {
          await renderBackground(false);
        }
      });
    }

    if (DOM.nasaApiConfigBtn) {
      DOM.nasaApiConfigBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openNasaApiModal();
      });
    }

    if (DOM.nasaApiResetBtn) {
      DOM.nasaApiResetBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm(t('newtab.nasaApi.resetConfirm', null, '确定恢复为默认 DEMO_KEY 吗？'))) {
          await NasaApiKeyManager.reset();
          updateNasaApiKeyStatus();
          await refreshCurrentNasaWallpaper();
        }
      });
    }

    if (DOM.nasaApiCloseBtn) {
      DOM.nasaApiCloseBtn.addEventListener('click', closeNasaApiModal);
    }

    if (DOM.nasaApiCancelBtn) {
      DOM.nasaApiCancelBtn.addEventListener('click', closeNasaApiModal);
    }

    if (DOM.nasaApiSaveBtn) {
      DOM.nasaApiSaveBtn.addEventListener('click', async () => {
        await saveNasaApiKey(DOM.nasaApiInput ? DOM.nasaApiInput.value : '');
      });
    }

    if (DOM.nasaApiInput) {
      DOM.nasaApiInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await saveNasaApiKey(DOM.nasaApiInput.value);
          return;
        }

        if (e.key === 'Escape') {
          e.preventDefault();
          closeNasaApiModal();
        }
      });
    }

    if (DOM.nasaApiModal) {
      DOM.nasaApiModal.addEventListener('click', (e) => {
        if (e.target === DOM.nasaApiModal) {
          closeNasaApiModal();
        }
      });
    }

    // 收藏按钮点击事件
    DOM.favBtn.addEventListener('click', async () => {
      if (currentWallpaperData && !currentWallpaperData.isGradient) {
        // 防止重复快速点击，加个微小的动画类可能更好，这里先直接存
        await FavoritesManager.toggleFavorite(currentWallpaperData);
        updateFavoriteButtonState();

        // 如果当前处在收藏轮播模式，并且刚刚取消了最后一张收藏，也需要重新渲染
        if (SettingsManager.settings.provider === 'favorites' && FavoritesManager.favorites.length === 0) {
          renderBackground(true);
        }
      }
    });

    if (DOM.clearFavoritesBtn) {
      DOM.clearFavoritesBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm(t('newtab.clearFavoritesConfirm', null, 'Clear all favorited wallpapers? This cannot be undone.'))) {
          await FavoritesManager.clear();
          updateFavoriteButtonState();
          if (SettingsManager.settings.provider === 'favorites') {
            renderBackground(true);
          }
        }
      });
    }

    // 刷新按钮点击事件
    DOM.refreshBtn.addEventListener('click', async () => {
      if (DOM.refreshBtn.classList.contains('loading')) return;
      DOM.refreshBtn.classList.add('loading');

      try {
        await renderBackground(true);
      } finally {
        setTimeout(() => DOM.refreshBtn.classList.remove('loading'), 500);
      }
    });
  }

  init();

})();
