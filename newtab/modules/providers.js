(function () {
  'use strict';

  function createWallpaperProviders(deps) {
    const {
      constants,
      isZhLocale,
      containsCjk,
      getBingLocaleConfig,
      getBingVariantKey,
      fetchWithRetry,
      isRetryableStatus,
      nasaApiKeyManager,
      favoritesManager,
      historyManager,
      fetchImpl,
      consoleObject,
      screenObject,
      devicePixelRatio
    } = deps || {};

    if (!constants || !getBingLocaleConfig || !getBingVariantKey || !fetchWithRetry || !nasaApiKeyManager || !favoritesManager || !historyManager) {
      throw new Error('createWallpaperProviders missing required dependencies');
    }

    const safeFetch = typeof fetchImpl === 'function' ? fetchImpl : fetch.bind(window);
    const safeConsole = consoleObject || console;
    const safeScreen = screenObject || window.screen;
    const safeDevicePixelRatio = Number.isFinite(devicePixelRatio) ? devicePixelRatio : (window.devicePixelRatio || 1);

    const state = {
      bingDateOffset: 0,
      nasaDateOffset: 0
    };

    async function translateText(text, options = {}) {
      if (!text) return '';

      const sourceLang = options.sourceLang || 'en';
      const targetLang = options.targetLang || 'zh-CN';

      try {
        const chunks = [];
        if (text.length > 450) {
          const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
          let currentChunk = '';
          sentences.forEach(sentence => {
            if (currentChunk.length + sentence.length < 450) {
              currentChunk += sentence;
            } else {
              if (currentChunk) chunks.push(currentChunk);
              currentChunk = sentence;
            }
          });
          if (currentChunk) chunks.push(currentChunk);
        } else {
          chunks.push(text);
        }

        const translatedParts = [];
        for (const chunk of chunks) {
          const response = await safeFetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${encodeURIComponent(sourceLang)}|${encodeURIComponent(targetLang)}`);
          if (!response.ok) continue;

          const payload = await response.json();
          const translatedText = payload?.responseData?.translatedText;
          if (translatedText && !translatedText.includes('QUERY LENGTH LIMIT')) {
            translatedParts.push(translatedText);
          }
        }

        if (translatedParts.length > 0) {
          return translatedParts.join(' ');
        }
      } catch (error) {
        safeConsole.warn('[NewTab] MyMemory translation failed, trying Google:', error);
      }

      try {
        const trimmedText = text.substring(0, 500);
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(trimmedText)}`;
        const response = await safeFetch(url);
        if (!response.ok) return '';

        const payload = await response.json();
        let translatedText = '';
        if (Array.isArray(payload?.[0])) {
          payload[0].forEach(item => {
            if (item?.[0]) translatedText += item[0];
          });
        }
        return translatedText;
      } catch (error) {
        safeConsole.warn('[NewTab] Google translation failed', error);
      }

      return '';
    }

    async function localizeBingContent(payload) {
      if (!payload || isZhLocale) return payload;

      const needsTranslation = [payload.title, payload.show, payload.detail, payload.copyright].some(containsCjk);
      if (!needsTranslation) return payload;

      const [title, show, detail, copyright] = await Promise.all([
        translateText(payload.title, { sourceLang: 'auto', targetLang: 'en' }),
        translateText(payload.show, { sourceLang: 'auto', targetLang: 'en' }),
        translateText(payload.detail, { sourceLang: 'auto', targetLang: 'en' }),
        translateText(payload.copyright, { sourceLang: 'auto', targetLang: 'en' })
      ]);

      return {
        ...payload,
        title: title || payload.title,
        show: show || payload.show,
        detail: detail || payload.detail,
        copyright: copyright || payload.copyright
      };
    }

    const providers = {
      async bing(forceRefresh = false) {
        if (forceRefresh) {
          state.bingDateOffset++;
        }

        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - state.bingDateOffset);
        const dateStr = targetDate.getFullYear().toString()
          + String(targetDate.getMonth() + 1).padStart(2, '0')
          + String(targetDate.getDate()).padStart(2, '0');
        const bingConfig = getBingLocaleConfig();

        if (bingConfig.mode === 'ee123') {
          const fetchUrl = `${constants.BING_API_ZH}?date=${dateStr}&size=UHD&type=json`;
          const response = await fetchWithRetry(fetchUrl);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const payload = await response.json();
          const imageUrl = payload.imgurl || payload.imgurl_d || payload.url;
          if (!imageUrl) throw new Error('No image data');

          return localizeBingContent({
            url: imageUrl,
            copyright: payload.imgcopyright || payload.imgtitle || 'Bing Wallpaper',
            title: payload.imgtitle || '',
            show: payload.imgshow || '',
            detail: payload.imgdetail || '',
            provider: 'bing',
            _dateStr: dateStr,
            _bingVariant: getBingVariantKey()
          });
        }

        const officialOffset = Math.min(state.bingDateOffset, 7);
        state.bingDateOffset = officialOffset;

        const fetchUrl = `${constants.BING_API_EN}?format=js&idx=${officialOffset}&n=1&pid=hp&FORM=BEHPTB&uhd=1&uhdwidth=3840&uhdheight=2160&setmkt=${encodeURIComponent(bingConfig.market.toLowerCase())}&setlang=en-us`;
        const response = await fetchWithRetry(fetchUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const payload = await response.json();
        const image = Array.isArray(payload.images) ? payload.images[0] : null;
        if (!image) throw new Error('No image data');

        const imageUrl = image.url
          ? `${constants.BING_API_ROOT_EN}${image.url}`
          : (image.urlbase ? `${constants.BING_API_ROOT_EN}${image.urlbase}_UHD.jpg` : '');
        if (!imageUrl) throw new Error('No image url');

        const title = image.title || '';
        const copyright = image.copyright || title || 'Bing Wallpaper';

        return localizeBingContent({
          url: imageUrl,
          copyright,
          title,
          show: '',
          detail: image.copyright && image.copyright !== image.title ? image.copyright : '',
          provider: 'bing',
          _dateStr: image.startdate || dateStr,
          _bingVariant: getBingVariantKey()
        });
      },

      async nasa(forceRefresh = false) {
        if (forceRefresh) {
          state.nasaDateOffset++;
        }

        const maxSkip = 10;
        for (let skip = 0; skip < maxSkip; skip++) {
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() - state.nasaDateOffset - skip);
          const year = targetDate.getFullYear();
          const month = String(targetDate.getMonth() + 1).padStart(2, '0');
          const day = String(targetDate.getDate()).padStart(2, '0');

          const fetchUrl = `${constants.NASA_API_ROOT}?api_key=${encodeURIComponent(nasaApiKeyManager.getKey())}&date=${year}-${month}-${day}`;
          const response = await fetchWithRetry(fetchUrl, {
            retryOnStatus: status => status === 429 || isRetryableStatus(status)
          });

          if (!response.ok) {
            if (response.status === 429) throw new Error('NASA Rate Limit Exceeded');
            state.nasaDateOffset++;
            continue;
          }

          const payload = await response.json();
          if (payload.media_type !== 'image') {
            state.nasaDateOffset++;
            continue;
          }

          let finalTitle = payload.title || '';
          let finalDetail = payload.explanation || '';

          if (isZhLocale) {
            const [translatedTitle, translatedDetail] = await Promise.all([
              translateText(payload.title),
              translateText(payload.explanation)
            ]);

            finalTitle = translatedTitle ? `${translatedTitle} | ${payload.title}` : (payload.title || '');
            finalDetail = translatedDetail
              ? `${translatedDetail}<br><br><span style="color:var(--text-secondary);font-size:0.95em;opacity:0.8;">${payload.explanation}</span>`
              : (payload.explanation || '');
          }

          return {
            url: payload.hdurl || payload.url,
            copyright: `NASA APOD: ${finalTitle}` + (payload.copyright ? ` (© ${payload.copyright.trim()})` : ''),
            title: finalTitle,
            detail: finalDetail,
            provider: 'nasa',
            _dateStr: `${year}${month}${day}`
          };
        }

        throw new Error('NASA returned video-only results for multiple days');
      },

      async picsum() {
        const width = safeScreen.width * safeDevicePixelRatio;
        const height = safeScreen.height * safeDevicePixelRatio;
        const seed = Math.floor(Math.random() * 100000);

        return {
          url: `https://picsum.photos/seed/${seed}/${Math.round(width)}/${Math.round(height)}`,
          copyright: 'Random image from Lorem Picsum',
          provider: 'picsum'
        };
      },

      async favorites(forceRefresh = false) {
        if (favoritesManager.favorites.length === 0) {
          return providers.bing(forceRefresh);
        }

        const maxRetries = 10;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          const favorite = favoritesManager.getRandomFavorite();
          if (favoritesManager.favorites.length <= 1 || !historyManager.isRecent(favorite.url) || attempt === maxRetries - 1) {
            return favorite;
          }
        }

        return favoritesManager.getRandomFavorite();
      }
    };

    return {
      get(name) {
        return providers[name] || providers.bing;
      },
      getState() {
        return {
          _bingDateOffset: state.bingDateOffset,
          _nasaDateOffset: state.nasaDateOffset
        };
      },
      restoreState(payload) {
        if (payload && payload._bingDateOffset !== undefined) {
          state.bingDateOffset = Number(payload._bingDateOffset) || 0;
        }
        if (payload && payload._nasaDateOffset !== undefined) {
          state.nasaDateOffset = Number(payload._nasaDateOffset) || 0;
        }
      },
      resetAllOffsets() {
        state.bingDateOffset = 0;
        state.nasaDateOffset = 0;
      },
      resetBingDateOffset() {
        state.bingDateOffset = 0;
      },
      resetNasaDateOffset() {
        state.nasaDateOffset = 0;
      }
    };
  }

  window.JadeNewtabProviders = {
    createWallpaperProviders
  };
})();
