(function initToolsModule(global) {
  'use strict';

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function createScanSession() {
    return {
      cancelled: false,
      controllers: new Set()
    };
  }

  function cancelScan(scanSession) {
    if (!scanSession || scanSession.cancelled) return;
    scanSession.cancelled = true;
    if (scanSession.controllers && scanSession.controllers.forEach) {
      scanSession.controllers.forEach((controller) => {
        try {
          controller.abort();
        } catch (_) {
          // ignore
        }
      });
      scanSession.controllers.clear();
    }
  }

  function collectHttpLinks(tree) {
    const links = [];
    const walk = (nodes) => {
      (nodes || []).forEach((node) => {
        if (node && node.url && (node.url.startsWith('http://') || node.url.startsWith('https://'))) {
          links.push(node);
        }
        if (node && Array.isArray(node.children) && node.children.length > 0) {
          walk(node.children);
        }
      });
    };
    walk(Array.isArray(tree) ? tree : []);
    return links;
  }

  async function fetchWithTimeout(fetchImpl, url, options, timeoutMs, scanSession) {
    const controller = new AbortController();
    if (scanSession && scanSession.controllers) {
      scanSession.controllers.add(controller);
    }
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { ...(options || {}), signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
      if (scanSession && scanSession.controllers) {
        scanSession.controllers.delete(controller);
      }
    }
  }

  function createProbeLink(scanSession, options) {
    const opts = options || {};
    const fetchImpl = typeof opts.fetchImpl === 'function' ? opts.fetchImpl : fetch;
    const headTimeoutMs = Number.isFinite(opts.headTimeoutMs) ? opts.headTimeoutMs : 6000;
    const fallbackTimeoutMs = Number.isFinite(opts.fallbackTimeoutMs) ? opts.fallbackTimeoutMs : 7000;
    const retryDelayMs = Number.isFinite(opts.retryDelayMs) ? opts.retryDelayMs : 220;
    const retryableStatuses = new Set(opts.retryableStatuses || [408, 425, 429, 500, 502, 503, 504]);
    const definitiveBrokenStatuses = new Set(opts.definitiveBrokenStatuses || [404, 410, 451]);
    const restrictedButAliveStatuses = new Set(opts.restrictedButAliveStatuses || [401, 403]);

    return async function probeLink(url) {
      let lastHeadStatus = null;
      let lastErrorName = '';

      for (let attempt = 0; attempt < 2; attempt++) {
        if (scanSession && scanSession.cancelled) return { state: 'cancelled', reason: 'cancelled' };
        try {
          const headRes = await fetchWithTimeout(fetchImpl, url, {
            method: 'HEAD',
            cache: 'no-store',
            redirect: 'follow'
          }, headTimeoutMs, scanSession);
          lastHeadStatus = headRes.status;

          if (headRes.ok) return { state: 'alive', reason: `http_${headRes.status}` };
          if (definitiveBrokenStatuses.has(headRes.status)) return { state: 'broken', reason: `http_${headRes.status}` };
          if (restrictedButAliveStatuses.has(headRes.status)) return { state: 'alive', reason: `http_${headRes.status}` };
          if (headRes.status === 405) break;

          if (retryableStatuses.has(headRes.status) && attempt < 1) {
            await sleep(retryDelayMs);
            continue;
          }
          break;
        } catch (err) {
          if (scanSession && scanSession.cancelled) return { state: 'cancelled', reason: 'cancelled' };
          lastErrorName = err && err.name ? err.name : 'Error';
          if (lastErrorName === 'AbortError' && attempt < 1) {
            await sleep(retryDelayMs);
            continue;
          }
          break;
        }
      }

      for (let fallbackAttempt = 0; fallbackAttempt < 2; fallbackAttempt++) {
        if (scanSession && scanSession.cancelled) return { state: 'cancelled', reason: 'cancelled' };
        try {
          await fetchWithTimeout(fetchImpl, url, {
            method: 'GET',
            mode: 'no-cors',
            cache: 'no-store',
            redirect: 'follow'
          }, fallbackTimeoutMs, scanSession);
          return { state: 'alive', reason: 'opaque_get' };
        } catch (err) {
          if (scanSession && scanSession.cancelled) return { state: 'cancelled', reason: 'cancelled' };
          lastErrorName = err && err.name ? err.name : 'Error';
          if (lastErrorName === 'AbortError' && fallbackAttempt < 1) {
            await sleep(retryDelayMs);
            continue;
          }
        }
      }

      if (lastHeadStatus && definitiveBrokenStatuses.has(lastHeadStatus)) {
        return { state: 'broken', reason: `http_${lastHeadStatus}` };
      }
      if (lastHeadStatus) {
        return { state: 'uncertain', reason: `http_${lastHeadStatus}` };
      }
      if (lastErrorName === 'AbortError') {
        return { state: 'uncertain', reason: 'timeout' };
      }
      return { state: 'uncertain', reason: 'network_failure' };
    };
  }

  function getCachedProbe(cacheStore, url, nowMs, ttlMs) {
    if (!cacheStore || !url) return null;
    const entry = cacheStore[url];
    if (!entry || typeof entry !== 'object') return null;
    const checkedAt = Number(entry.checkedAt || 0);
    if (!checkedAt || (nowMs - checkedAt) > ttlMs) return null;
    if (!entry.probe || typeof entry.probe !== 'object') return null;
    return entry.probe;
  }

  function setCachedProbe(cacheStore, url, probe, nowMs) {
    if (!cacheStore || !url || !probe || typeof probe !== 'object') return;
    if (probe.state === 'cancelled') return;
    cacheStore[url] = {
      checkedAt: nowMs,
      probe: {
        state: probe.state || 'uncertain',
        reason: probe.reason || 'unknown'
      }
    };
  }

  async function scanLinks(links, options) {
    const opts = options || {};
    const concurrency = Math.max(1, opts.concurrency || 4);
    const isCancelled = typeof opts.isCancelled === 'function' ? opts.isCancelled : () => false;
    const probeLink = opts.probeLink;
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

    if (typeof probeLink !== 'function') {
      throw new Error('scanLinks requires probeLink function');
    }

    const brokenLinks = [];
    const uncertainLinks = [];
    let aliveCount = 0;
    let currentIndex = 0;
    let completed = 0;

    async function worker() {
      while (!isCancelled()) {
        const index = currentIndex++;
        if (index >= links.length) break;
        const node = links[index];
        let probe = null;
        try {
          probe = await probeLink(node.url);
        } catch (_) {
          probe = { state: 'uncertain', reason: 'probe_error' };
        }
        if (isCancelled()) break;
        if (probe && probe.state === 'broken') brokenLinks.push({ node, probe });
        else if (probe && probe.state === 'uncertain') uncertainLinks.push({ node, probe });
        else if (probe && probe.state === 'alive') aliveCount++;
        completed++;
        if (onProgress) onProgress(completed, links.length);
      }
    }

    const workers = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    return {
      brokenLinks,
      uncertainLinks,
      aliveCount,
      completed
    };
  }

  async function runBrokenLinkScan(links, scanSession, options) {
    const opts = options || {};
    const list = Array.isArray(links) ? links : [];
    const cacheStore = (opts.cache && typeof opts.cache === 'object') ? opts.cache : null;
    const cacheTtlMs = Number.isFinite(opts.cacheTtlMs) ? opts.cacheTtlMs : (24 * 60 * 60 * 1000);
    const nowMs = Date.now();
    if (list.length === 0) {
      return {
        links: [],
        brokenLinks: [],
        uncertainLinks: [],
        aliveCount: 0,
        completed: 0,
        cacheHits: 0,
        probesRun: 0
      };
    }

    const brokenLinks = [];
    const uncertainLinks = [];
    let aliveCount = 0;
    let cacheHits = 0;
    let probesRun = 0;
    let completedOffset = 0;
    const uncachedLinks = [];
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

    for (let i = 0; i < list.length; i++) {
      const node = list[i];
      const cachedProbe = getCachedProbe(cacheStore, node.url, nowMs, cacheTtlMs);
      if (!cachedProbe) {
        uncachedLinks.push(node);
        continue;
      }

      cacheHits++;
      completedOffset++;
      if (cachedProbe.state === 'broken') brokenLinks.push({ node, probe: cachedProbe });
      else if (cachedProbe.state === 'uncertain') uncertainLinks.push({ node, probe: cachedProbe });
      else if (cachedProbe.state === 'alive') aliveCount++;
      if (onProgress) onProgress(completedOffset, list.length);
    }

    const baseProbeLink = createProbeLink(scanSession, opts);
    const probeLink = async (url) => {
      const probe = await baseProbeLink(url);
      if (probe && probe.state !== 'cancelled') {
        setCachedProbe(cacheStore, url, probe, Date.now());
      }
      return probe;
    };

    const result = await scanLinks(uncachedLinks, {
      concurrency: Math.max(1, opts.concurrency || 4),
      isCancelled: () => !!(scanSession && scanSession.cancelled),
      probeLink,
      onProgress: (completed, total) => {
        probesRun = completed;
        if (onProgress) onProgress(completedOffset + completed, completedOffset + total);
      }
    });

    return {
      links: list,
      brokenLinks: brokenLinks.concat(result.brokenLinks || []),
      uncertainLinks: uncertainLinks.concat(result.uncertainLinks || []),
      aliveCount: aliveCount + (result.aliveCount || 0),
      completed: completedOffset + (result.completed || 0),
      cacheHits,
      probesRun
    };
  }

  global.JadeModules = global.JadeModules || {};
  global.JadeModules.tools = {
    sleep,
    createScanSession,
    cancelScan,
    collectHttpLinks,
    createProbeLink,
    scanLinks,
    runBrokenLinkScan
  };
})(window);
