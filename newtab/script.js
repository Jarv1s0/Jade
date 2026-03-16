/**
 * New Tab — 核心脚本
 * 功能：多源壁纸（Bing/NASA/Picsum/渐变/无）、收藏轮播 + Google 搜索
 */

(function () {
  'use strict';

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
    clearFavoritesBtn: document.getElementById('clear-favorites-btn'),
    storyCard: document.getElementById('story-card'),
    storyTitle: document.getElementById('story-title'),
    storyBody: document.getElementById('story-body'),
    storyClose: document.getElementById('story-close')
  };

  const CONSTANTS = {
    BING_API: 'https://bing.ee123.net/img/',
    BING_API_RAND: 'https://bing.ee123.net/img/rand',
    NASA_API: 'https://api.nasa.gov/planetary/apod?api_key=0MsI7Uti0ePSZuLvN2ZOJq4C2f4PaQjbBKPq1yQs',
    CACHE_KEYS: {
      SETTINGS: 'newtab_settings',
      FAVORITES: 'newtab_favorites',
      FAVORITES_CURRENT: 'newtab_favorites_current',
      BING: 'newtab_cache_bing',
      NASA: 'newtab_cache_nasa',
      PICSUM: 'newtab_cache_picsum',
      CURRENT_WALLPAPER: 'newtab_current_wallpaper'
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

  // 当前壁纸的元数据（用于收藏）
  let currentWallpaperData = null;
  let wallpaperRenderToken = 0;

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

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
  const WallpaperProviders = {
        // Bing 日期偏移量（每次点击刷新 +1，往前回退一天）
    _bingDateOffset: 0,

    // ---- 1. Bing 每日超清壁纸 (按日期倒序浏览) ----
    async bing(forceRefresh = false) {
      // forceRefresh 时偏移量 +1（回到前一天），否则保持当前偏移量
      if (forceRefresh) {
        this._bingDateOffset++;
      }

      // 根据偏移量计算目标日期
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - this._bingDateOffset);
      const dateStr = targetDate.getFullYear().toString() +
        String(targetDate.getMonth() + 1).padStart(2, '0') +
        String(targetDate.getDate()).padStart(2, '0');

      const fetchUrl = `${CONSTANTS.BING_API}?date=${dateStr}&size=UHD&type=json`;

      const response = await fetchWithRetry(fetchUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const imageUrl = data.imgurl || data.imgurl_d || data.url;
      if (!imageUrl) throw new Error('No image data');

      return {
        url: imageUrl,
        copyright: data.imgcopyright || data.imgtitle || 'Bing Wallpaper',
        title: data.imgtitle || '',
        show: data.imgshow || '',
        detail: data.imgdetail || '',
        provider: 'bing',
        _dateStr: dateStr
      };
    },

        // --- 简单的免费翻译接口辅助函数 (Google App Script 或直接调用公开接口) ---
    async _translate(text) {
      if (!text) return '';
      try {
        // MyMemory API 限制单次 500 字符。如果超长，则按句号切分再合并
        let chunks = [];
        if (text.length > 450) {
          const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
          let currentChunk = '';
          sentences.forEach(s => {
            if (currentChunk.length + s.length < 450) {
              currentChunk += s;
            } else {
              chunks.push(currentChunk);
              currentChunk = s;
            }
          });
          if (currentChunk) chunks.push(currentChunk);
        } else {
          chunks = [text];
        }

        let translatedArr = [];
        for (let chunk of chunks) {
          const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|zh-CN`);
          if (res.ok) {
            const json = await res.json();
            if (json && json.responseData && json.responseData.translatedText && !json.responseData.translatedText.includes('QUERY LENGTH LIMIT')) {
              translatedArr.push(json.responseData.translatedText);
            }
          }
        }

        if (translatedArr.length > 0) {
          return translatedArr.join(' ');
        }
      } catch (e) {
        console.warn('MyMemory 翻译失败, 尝试 Google:', e);
      }

      try {
        // 后备：Google 免费接口
        const t = text.substring(0, 500); // 防超长
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(t)}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          let translatedText = '';
          if (json && json[0]) {
            json[0].forEach(item => {
              if (item[0]) translatedText += item[0];
            });
          }
          return translatedText;
        }
      } catch (e) {
        console.warn('Google 翻译失败', e);
      }
      return '';
    },

        // NASA 日期偏移量（与 Bing 同理）
    _nasaDateOffset: 0,

    // ---- 2. NASA 每日天文图 (按日期倒序浏览) ----
    async nasa(forceRefresh = false) {
      if (forceRefresh) {
        this._nasaDateOffset++;
      }

      // 最多连续跳过 10 天的视频类型
      const maxSkip = 10;
      for (let skip = 0; skip < maxSkip; skip++) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - this._nasaDateOffset - skip);
        const y = targetDate.getFullYear();
        const m = String(targetDate.getMonth() + 1).padStart(2, '0');
        const d = String(targetDate.getDate()).padStart(2, '0');

        const fetchUrl = `${CONSTANTS.NASA_API}&date=${y}-${m}-${d}`;
        const response = await fetchWithRetry(fetchUrl, {
          retryOnStatus: (status) => status === 429 || isRetryableStatus(status)
        });
        if (!response.ok) {
          if (response.status === 429) throw new Error('NASA Rate Limit Exceeded');
          // 404 等错误（当天图片尚未发布），跳到前一天
          this._nasaDateOffset++;
          continue;
        }

        const data = await response.json();
        if (data.media_type !== 'image') {
          // 遇到视频，额外把偏移量也推进，跳过这天
          this._nasaDateOffset++;
          continue;
        }

        // 尝试获取翻译
        const [zhTitle, zhDetail] = await Promise.all([
          this._translate(data.title),
          this._translate(data.explanation)
        ]);

        const finalTitle = zhTitle ? `${zhTitle} | ${data.title}` : data.title || '';
        const finalDetail = zhDetail ? `${zhDetail}<br><br><span style="color:var(--text-secondary);font-size:0.95em;opacity:0.8;">${data.explanation}</span>` : data.explanation || '';

        return {
          url: data.hdurl || data.url,
          copyright: `NASA APOD: ${finalTitle}` + (data.copyright ? ` (© ${data.copyright.trim()})` : ''),
          title: finalTitle,
          detail: finalDetail,
          provider: 'nasa',
          _dateStr: `${y}${m}${d}`
        };
      }
      throw new Error('NASA: 连续多天为视频，无法获取图片');
    },

    // ---- 3. Picsum 随机壁纸 ----
    async picsum(forceRefresh = false) {

      // 获取屏幕分辨率
      const w = window.screen.width * window.devicePixelRatio;
      const h = window.screen.height * window.devicePixelRatio;
            // 避免缓存，加个随机种子
      const seed = Math.floor(Math.random() * 100000);
      const result = {
        url: `https://picsum.photos/seed/${seed}/${Math.round(w)}/${Math.round(h)}`,
        copyright: 'Random image from Lorem Picsum',
        provider: 'picsum'
      };
      return result;
    },

    // ---- 4. 收藏轮播 ----
    async favorites(forceRefresh = false) {
      if (FavoritesManager.favorites.length === 0) {
        // 如果没有收藏，直接回退并展示 Bing 每日壁纸
        return this.bing(forceRefresh);
      }

      // 为了防止每次连续刷到一样的（特别是收藏夹较少时）
      // 我们限制如果收藏大于1张，那么一定不要抽到当前 history 里的最后一张
      const maxRetries = 10;
      for (let i = 0; i < maxRetries; i++) {
        const fav = FavoritesManager.getRandomFavorite();
        // 如果只收藏了一张图，或者没看过，或者重试实在太多次了，就妥协
        if (FavoritesManager.favorites.length <= 1 || !HistoryManager.isRecent(fav.url) || i === maxRetries - 1) {
          return fav;
        }
      }
    }
  };

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
      DOM.favBtn.title = "取消收藏";
    } else {
      DOM.favBtn.classList.remove('active');
      DOM.favBtn.title = "收藏这张壁纸";
    }
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
          } else {
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
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
        // 对收藏检查是否被移除了
        if (providerKey !== 'favorites' || FavoritesManager.isFavorited(cached.url)) {
          // 恢复缓存对应的偏移量，防止新开标签页后点击刷新跳回最新天数
          if (cached._bingDateOffset !== undefined) WallpaperProviders._bingDateOffset = cached._bingDateOffset;
          if (cached._nasaDateOffset !== undefined) WallpaperProviders._nasaDateOffset = cached._nasaDateOffset;

          try {
            const applied = await applyWallpaper(cached, renderToken);
            if (applied) return;
          } catch (cacheErr) {
            console.warn('[NewTab] 缓存壁纸加载失败，改为重新拉取:', cacheErr.message);
          }
        }
      }
    }

    let providerFn = WallpaperProviders[providerKey];
    if (!providerFn) providerFn = WallpaperProviders.bing;

    try {
      const data = await providerFn.call(WallpaperProviders, forceRefresh);
      const applied = await applyWallpaper(data, renderToken);
      if (!applied || renderToken !== wallpaperRenderToken) return;
      // 新数据成功后，统一在此处写入持久化，并放入不重复历史名单。同时保存当下的日期偏移量。
      const cacheData = {
        ...data,
        _bingDateOffset: WallpaperProviders._bingDateOffset,
        _nasaDateOffset: WallpaperProviders._nasaDateOffset
      };
      await Cache.set(CONSTANTS.CACHE_KEYS.CURRENT_WALLPAPER, cacheData);
      await HistoryManager.add(data.url);
    } catch (err) {
      console.warn(`[NewTab] Provider '${providerKey}' 失败:`, err.message);
      // 其他任何获取异常（如无网络、接口报错等）全部回退到必应（必应非常稳定）
      try {
        const data = await WallpaperProviders.bing();
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
      HistoryManager.load()
    ]);
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
        // 切换来源时重置日期偏移量，确保显示最新壁纸
        WallpaperProviders._bingDateOffset = 0;
        WallpaperProviders._nasaDateOffset = 0;
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
        WallpaperProviders._bingDateOffset = 0;
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
        WallpaperProviders._nasaDateOffset = 0;
        await Cache.set(CONSTANTS.CACHE_KEYS.CURRENT_WALLPAPER, null);
        if (SettingsManager.settings.provider === 'nasa') {
          await renderBackground(false);
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
        if (confirm('确定要清空所有收藏的壁纸吗？此操作不可撤销。')) {
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
