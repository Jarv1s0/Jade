(function initJadeI18n(global) {
  'use strict';

  const messages = {
    zh_CN: {
      common: {
        untitled: '无标题',
        untitledBookmark: '未命名书签',
        untitledFolder: '未命名文件夹',
        unknownTime: '未知时间',
        justNow: '刚刚',
        minutesAgo: '{{count}} 分钟前',
        todayTime: '今天 {{time}}',
        yesterdayTime: '昨天 {{time}}',
        monthDay: '{{month}}月{{day}}日',
        cancel: '取消',
        save: '保存',
        continue: '继续',
        delete: '删除',
        clear: '清空',
        close: '关闭',
        loading: '处理中...',
        undo: '撤销',
        noData: '暂无数据',
        back: '返回'
      },
      popup: {
        pageTitle: 'Jade 书签启动器',
        bookmarkBar: '书签栏',
        rootFolder: '根目录',
        searchPlaceholder: '搜索书签...',
        shortcutMac: '⌘K',
        shortcutWin: 'Ctrl K',
        sections: {
          frequent: '我的置顶',
          groups: '我的分组',
          recent: '最近访问'
        },
        footer: {
          manageBookmarks: '书签管理',
          toolbox: '工具箱'
        },
        contextMenu: {
          addToPinned: '添加到我的置顶',
          removeFromPinned: '从我的置顶移除',
          addToGroup: '添加到我的分组',
          sortByName: '按名称排序',
          sortByTime: '按时间排序',
          removeFromRecent: '从最近访问列表移除',
          edit: '编辑',
          delete: '删除'
        },
        emptyPinned: '将你最常访问的网站添加到这里<br>最多 8 个，仅由你手动管理。',
        recentClosed: '最近关闭',
        history: '历史记录',
        noRecentVisits: '暂无最近访问记录',
        uncategorizedBookmarks: '未分类书签',
        searchResultLabel: '搜索: "{{query}}"',
        clearSearch: '清除',
        emptySearch: '未找到相关内容',
        emptyFolder: '此文件夹为空',
        pinCardTitle: '取消置顶',
        backButton: '返回',
        sessionsMeta: '[最近关闭]',
        sessionWindowMeta: '[最近关闭窗口]',
        toasts: {
          removedFromPinned: '已从我的置顶移除',
          featureInProgress: '开发中：支持将其添加到我的分组',
          removedFromRecent: '已从最近访问列表移除',
          maxPinned: '我的置顶最多只能添加 8 个网站',
          addedToPinned: '已添加到我的置顶'
        },
        edit: {
          titleFolder: '编辑文件夹',
          titleBookmark: '编辑书签',
          titleFrequent: '编辑常用访问',
          nameLabel: '名称',
          namePlaceholder: '书签名称',
          urlLabel: '网址',
          urlPlaceholder: 'https://...'
        },
        confirm: {
          defaultTitle: '确认危险操作',
          defaultHint: '此操作不可撤销，是否继续？',
          deleteFolder: '确定删除该文件夹及其所有子项吗？',
          deleteBookmark: '确定删除该书签吗？',
          importTitle: '确认导入书签',
          importHint: '将自动创建一个导入文件夹，导入后可继续手动整理。',
          importOk: '开始导入'
        },
        tools: {
          toolboxTitle: '书签工具箱',
          groupData: '数据管理',
          groupCleanup: '清理与维护',
          groupAnalyze: '分析与高级',
          importTitle: '导入书签',
          importDesc: '从 HTML 文件恢复书签数据',
          importSelectFile: '选择文件',
          importWarning: '⚠️ 导入会在“其他书签”下创建新文件夹并写入内容。支持标准 HTML 书签文件（Netscape 格式），导入后可手动整理。',
          importWaiting: '状态：等待选择文件',
          importReading: '状态：正在读取导入文件...',
          importParsing: '正在解析文件...',
          importEmpty: '状态：未检测到可导入的书签条目',
          importEmptyResult: '文件中没有可导入的数据',
          importCancelled: '状态：已取消导入',
          importProgress: '状态：正在导入 {{percent}}%（{{processed}}/{{total}}）',
          importDone: '状态：导入完成（成功 {{success}} 项，跳过 {{skipped}} 项）',
          importFailed: '状态：导入失败（{{reason}}）',
          importFailedResult: '导入失败，请检查文件格式是否为标准 HTML 书签文件',
          importSummaryTitle: '导入目录：{{title}}',
          importSummaryBookmarks: '成功导入书签：{{count}}',
          importSummaryFolders: '成功导入文件夹：{{count}}',
          importSummarySkipped: '跳过条目：{{count}}',
          importFolderName: 'Jade导入 · {{name}} · {{stamp}}',
          importDefaultBaseName: '书签',
          importPrompt: '将从 "{{file}}" 导入 {{bookmarks}} 个书签、{{folders}} 个文件夹。',
          importLastStatus: '上次导入：{{bookmarks}} 书签 / {{folders}} 文件夹',
          exportTitle: '导出书签',
          exportDesc: '备份所有书签为 HTML 格式',
          exportReady: '状态：准备导出',
          exportNow: '立即导出',
          exportWarning: '💡 提示：导出书签将把当前所有书签及目录结构备份为一个标准 HTML 文件，可用于在其他浏览器中恢复。',
          exportGenerating: '状态：正在生成...',
          exportDone: '状态：导出成功',
          exportQueued: '导出任务已提交 ({{date}})',
          exportRetry: '重新导出',
          duplicatesTitle: '扫描重复',
          duplicatesDesc: '查找并清理包含相同网址的书签',
          duplicatesIdle: '状态：尚未扫描',
          duplicatesStart: '开始扫描',
          duplicatesWarning: '💡 提示：基于完全相同的 URL 来判断重复。批量清理重复项后将不可撤销退回，请谨慎操作。',
          duplicatesScanning: '运行中：正在扫描整个书签库...',
          duplicatesNone: '扫描完成：未发现任何重复的书签。',
          duplicatesDone: '扫描完成：共发现 {{count}} 组重复链接。',
          duplicatesLastStatusZero: '上次扫描：0 项重复',
          duplicatesLastStatus: '上次扫描：{{count}} 组重复',
          duplicatesClean: '清理选中项',
          duplicatesConfirm: '确定删除选中的 {{count}} 个重复书签吗？',
          duplicatesRescan: '重新扫描',
          statsTitle: '书签统计',
          statsDesc: '分析书签结构、层级及域名分布',
          statsIdle: '状态：尚未分析',
          statsStart: '开始分析',
          statsWarning: '💡 提示：全面统计书签库的层级结构与健康度，并生成域名的分布榜单，分析过程完全在本地进行。',
          statsCollecting: '运行中：正在收集数据...',
          statsDone: '分析完成',
          statsTotalBookmarks: '书签总数',
          statsTotalFolders: '文件夹总数',
          statsMaxDepth: '最深层级',
          statsEmptyFolders: '空文件夹',
          statsTopDomains: '域名分布 Top 10',
          statsStructureHealth: '结构健康度',
          statsDuplicateLinks: '重复链接',
          statsLargestFolder: '最大文件夹',
          statsNone: '无',
          statsGroups: '{{count}} 组',
          statsItems: '{{count}} 项',
          statsCountLabel: '共 {{count}} 个书签',
          statsReanalyze: '重新分析',
          brokenTitle: '检查失效链接',
          brokenDesc: '探测无法访问的书签链接',
          brokenIdle: '状态：尚未扫描',
          brokenStart: '开始检测',
          brokenWarning: '⚠️ 新策略：优先用 HEAD 探测并分级重试；无法高置信判定的条目会标记为“待复核”，避免误删。',
          brokenCollecting: '运行中：正在收集所有链接...',
          brokenModuleMissing: '状态：工具模块未加载，无法执行检测',
          brokenModuleMissingResult: '请刷新扩展后重试',
          brokenRetry: '重新检测',
          brokenNoHttp: '扫描完成：未发现有效 HTTP(S) 链接需要检测。',
          brokenPreparing: '运行中：已找到 {{count}} 个链接，准备探测。这可能需要一分钟。',
          brokenCancel: '取消检测',
          brokenCancelled: '检测已取消（{{completed}}/{{total}}）',
          brokenCancelledResult: '已取消本次检测',
          brokenProgress: '运行中：正在探测 {{completed}}/{{total}}...',
          brokenAllGood: '扫描完成：{{count}} 个链接均可访问。{{suffix}}',
          brokenAllGoodResult: '🎉 全部链接均正常！',
          brokenLastStatusClean: '上次扫描：未发现死链',
          brokenDoneMixed: '扫描完成：确认失效 {{broken}} 条，待复核 {{uncertain}} 条。{{suffix}}',
          brokenDoneReviewOnly: '扫描完成：未发现高置信失效链接，待复核 {{uncertain}} 条。{{suffix}}',
          brokenLastStatus: '上次扫描：{{broken}} 确认失效 / {{uncertain}} 待复核',
          brokenCacheSuffix: '（缓存复用 {{count}} 条）',
          brokenConfirmedGroup: '确认失效（高置信）',
          brokenReviewGroup: '待复核（可能受跨域、防爬、网络波动影响）',
          brokenClean: '清理选中项',
          brokenConfirmDelete: '确定删除选中的 {{count}} 条链接吗？',
          brokenReviewHint: '当前均为待复核条目，建议先手动确认后再删除。',
          brokenDangerHint: '已包含高置信失效条目，仍建议在删除前快速复核。',
          emptyFoldersTitle: '清理空文件夹',
          emptyFoldersDesc: '清理不再包含任何子项的文件夹',
          emptyFoldersIdle: '状态：尚未分析',
          emptyFoldersStart: '开始扫描',
          emptyFoldersWarning: '💡 提示：扫描并永久清理内部不含有任何书签、也没有有效子文件夹的空壳目录。',
          emptyFoldersScanning: '运行中：正在扫描结构...',
          emptyFoldersNone: '扫描完成：未发现任何空文件夹。',
          emptyFoldersDone: '扫描完成：发现 {{count}} 个空壳文件夹。',
          emptyFoldersLastStatusZero: '上次扫描：0 个空壳',
          emptyFoldersLastStatus: '上次扫描：{{count}} 个空壳',
          emptyFoldersClean: '清理选中项',
          emptyFoldersConfirm: '确定删除选中的 {{count}} 个空文件夹吗？',
          batchReplaceTitle: '批量替换 URL',
          batchReplaceDesc: '使用正则匹配并修改多个链接后缀',
          batchReplaceRuleTitle: '查找与替换规则',
          batchReplaceFindPlaceholder: '查找内容 (例如: old-domain.com)',
          batchReplaceReplacePlaceholder: '替换为 (留空表示删除匹配内容)',
          batchReplaceScope: '作用范围：所有书签 URL',
          batchReplacePreview: '执行预演',
          batchReplaceHintTitle: '操作提示',
          batchReplaceHint: '请在上方输入查找内容和替换内容，然后点击"执行预演"',
          batchReplaceWarning: '⚠️ <strong>风险提示：</strong> 正式替换不可撤销，请先执行预演并仔细确认结果。',
          batchReplaceReadyHint: '已输入查找规则，点击"执行预演"查看将要被替换的链接。',
          batchReplaceScanning: '正在扫描...',
          batchReplacePreviewing: '<div class="url-inline-spinner"><svg class="spin-icon" viewBox="0 0 24 24" fill="none" width="14" height="14" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> 正在预演替换结果...</div>',
          batchReplaceNone: '未找到可替换 URL',
          batchReplaceResultTitle: '扫描结果',
          batchReplaceResultText: '找到 {{count}} 条可替换链接，请仔细确认以下变更记录：',
          batchReplacePreviewTitle: '预览样例 (前 {{count}} 条)',
          batchReplaceMore: '...及其他 {{count}} 项',
          batchReplaceEditRule: '编辑规则',
          batchReplaceConfirm: '确认替换 {{count}} 条',
          batchReplaceRepreview: '重新预演',
          batchReplaceBackToEdit: '已返回编辑模式，修改规则后可重新预演。',
          batchReplaceConfirmPrompt: '确定替换这 {{count}} 条 URL 吗？',
          batchReplaceConfirmOk: '替换',
          batchReplaceRunning: '<div class="url-inline-spinner"><svg class="spin-icon" viewBox="0 0 24 24" fill="none" width="14" height="14" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> 正在替换...</div>',
          batchReplaceExecuting: '正在执行替换...',
          batchReplaceDone: '🎉 已成功替换 {{count}} 条 URL',
          batchReplaceLastStatus: '上次替换：{{count}} 项',
          batchReplaceDoneButton: '完成并返回',
          scanCleanWorking: '处理中：正在移除选中项...',
          cleanRunning: '清理中...',
          statusRunning: '处理中...',
          cleanLibrary: '🎉 您的书签库非常整洁！'
        },
        reasons: {
          unknown: '未知原因',
          http404: 'HTTP 404（页面不存在）',
          http410: 'HTTP 410（资源已删除）',
          http451: 'HTTP 451（受法律限制）',
          networkFailure: '网络连接失败',
          timeout: '请求超时',
          headBlocked: 'HEAD 请求受限',
          headInconclusive: 'HEAD 返回非确定状态',
          opaqueGet: '仅 no-cors 可访问（待复核）'
        }
      },
      newtab: {
        pageTitle: '新标签页',
        wallpaperStoryTitle: '点击查看壁纸故事',
        closeStory: '关闭',
        favoriteWallpaper: '收藏这张壁纸',
        unfavoriteWallpaper: '取消收藏',
        refreshWallpaper: '更新壁纸 (右键切换源)',
        refreshWallpaperAria: '更新壁纸',
        providers: {
          bing: '必应主页',
          nasa: 'NASA天文',
          picsum: '无尽随机',
          favorites: '我的收藏'
        },
        nasaApi: {
          title: 'NASA API Key',
          configure: '设置',
          reset: '默认',
          modalTitle: '配置 NASA API Key',
          placeholder: '输入你自己的 NASA API Key',
          hintHtml: '默认使用 <code>DEMO_KEY</code>，有速率限制。你也可以填写自己申请的 NASA API Key，配置仅保存在本地浏览器中。',
          modalHintHtml: '留空即恢复默认 <code>DEMO_KEY</code>。如果你有自己的 NASA API Key，可以填入后保存；该配置只保存在当前浏览器本地。',
          usingDefault: '当前使用默认 Key：{{key}}',
          usingCustom: '当前使用自定义 Key：{{key}}',
          resetConfirm: '确定恢复为默认 DEMO_KEY 吗？'
        },
        notices: {
          favoritesEmptyFallback: '当前还没有收藏壁纸，已自动回退到必应主页。',
          nasaRateLimitDefaultFallback: 'NASA 默认 DEMO_KEY 已触发限流，已临时回退到必应。你可以稍后再试，或填写自己的 NASA API Key。',
          nasaRateLimitCustomFallback: '当前 NASA API Key 已触发限流，已临时回退到必应。你可以稍后再试或更换 Key。',
          providerFallbackGeneric: '当前壁纸源暂时不可用，已自动回退到必应主页。'
        },
        today: '今天',
        clearFavorites: '清空',
        clearFavoritesConfirm: '确定要清空所有收藏的壁纸吗？此操作不可撤销。'
      }
    },
    en: {
      common: {
        untitled: 'Untitled',
        untitledBookmark: 'Untitled bookmark',
        untitledFolder: 'Untitled folder',
        unknownTime: 'Unknown time',
        justNow: 'Just now',
        minutesAgo: '{{count}} min ago',
        todayTime: 'Today {{time}}',
        yesterdayTime: 'Yesterday {{time}}',
        monthDay: '{{month}}/{{day}}',
        cancel: 'Cancel',
        save: 'Save',
        continue: 'Continue',
        delete: 'Delete',
        clear: 'Clear',
        close: 'Close',
        loading: 'Working...',
        undo: 'Undo',
        noData: 'No data',
        back: 'Back'
      },
      popup: {
        pageTitle: 'Jade Bookmark Launcher',
        bookmarkBar: 'Bookmark Bar',
        rootFolder: 'Root',
        searchPlaceholder: 'Search bookmarks...',
        shortcutMac: '⌘K',
        shortcutWin: 'Ctrl K',
        sections: {
          frequent: 'Pinned',
          groups: 'Groups',
          recent: 'Recent'
        },
        footer: {
          manageBookmarks: 'Manage Bookmarks',
          toolbox: 'Toolbox'
        },
        contextMenu: {
          addToPinned: 'Add to Pinned',
          removeFromPinned: 'Remove from Pinned',
          addToGroup: 'Add to Group',
          sortByName: 'Sort by Name',
          sortByTime: 'Sort by Time',
          removeFromRecent: 'Remove from Recent',
          edit: 'Edit',
          delete: 'Delete'
        },
        emptyPinned: 'Add your most visited sites here.<br>Up to 8 items, managed manually by you.',
        recentClosed: 'Recently Closed',
        history: 'History',
        noRecentVisits: 'No recent visits yet',
        uncategorizedBookmarks: 'Uncategorized Bookmarks',
        searchResultLabel: 'Search: "{{query}}"',
        clearSearch: 'Clear',
        emptySearch: 'No matches found',
        emptyFolder: 'This folder is empty',
        pinCardTitle: 'Unpin',
        backButton: 'Back',
        sessionsMeta: '[Recently Closed]',
        sessionWindowMeta: '[Recently Closed Window]',
        toasts: {
          removedFromPinned: 'Removed from Pinned',
          featureInProgress: 'In progress: add to group support',
          removedFromRecent: 'Removed from Recent',
          maxPinned: 'Pinned supports up to 8 sites',
          addedToPinned: 'Added to Pinned'
        },
        edit: {
          titleFolder: 'Edit Folder',
          titleBookmark: 'Edit Bookmark',
          titleFrequent: 'Edit Frequent Site',
          nameLabel: 'Name',
          namePlaceholder: 'Bookmark name',
          urlLabel: 'URL',
          urlPlaceholder: 'https://...'
        },
        confirm: {
          defaultTitle: 'Confirm Action',
          defaultHint: 'This action cannot be undone. Continue?',
          deleteFolder: 'Delete this folder and all of its children?',
          deleteBookmark: 'Delete this bookmark?',
          importTitle: 'Import Bookmarks',
          importHint: 'A new import folder will be created automatically so you can reorganize later.',
          importOk: 'Start Import'
        },
        tools: {
          toolboxTitle: 'Bookmark Toolbox',
          groupData: 'Data',
          groupCleanup: 'Cleanup',
          groupAnalyze: 'Analyze',
          importTitle: 'Import Bookmarks',
          importDesc: 'Restore bookmark data from an HTML file',
          importSelectFile: 'Select File',
          importWarning: '⚠️ Import creates a new folder under Other Bookmarks and writes imported entries there. Standard HTML bookmark files (Netscape format) are supported.',
          importWaiting: 'Status: waiting for file selection',
          importReading: 'Status: reading import file...',
          importParsing: 'Parsing file...',
          importEmpty: 'Status: no importable bookmark items detected',
          importEmptyResult: 'No importable data found in this file',
          importCancelled: 'Status: import cancelled',
          importProgress: 'Status: importing {{percent}}% ({{processed}}/{{total}})',
          importDone: 'Status: import complete ({{success}} imported, {{skipped}} skipped)',
          importFailed: 'Status: import failed ({{reason}})',
          importFailedResult: 'Import failed. Verify the file is a standard HTML bookmarks export.',
          importSummaryTitle: 'Imported into: {{title}}',
          importSummaryBookmarks: 'Bookmarks imported: {{count}}',
          importSummaryFolders: 'Folders imported: {{count}}',
          importSummarySkipped: 'Skipped: {{count}}',
          importFolderName: 'Jade Import · {{name}} · {{stamp}}',
          importDefaultBaseName: 'Bookmarks',
          importPrompt: 'Import {{bookmarks}} bookmarks and {{folders}} folders from "{{file}}"?',
          importLastStatus: 'Last import: {{bookmarks}} bookmarks / {{folders}} folders',
          exportTitle: 'Export Bookmarks',
          exportDesc: 'Back up all bookmarks as HTML',
          exportReady: 'Status: ready to export',
          exportNow: 'Export Now',
          exportWarning: '💡 Export backs up your full bookmark tree as a standard HTML file that can be restored in another browser.',
          exportGenerating: 'Status: generating export...',
          exportDone: 'Status: export complete',
          exportQueued: 'Export started ({{date}})',
          exportRetry: 'Export Again',
          duplicatesTitle: 'Find Duplicates',
          duplicatesDesc: 'Find and clean bookmarks with identical URLs',
          duplicatesIdle: 'Status: not scanned yet',
          duplicatesStart: 'Start Scan',
          duplicatesWarning: '💡 Duplicates are detected by exact URL match. Bulk cleanup cannot be undone.',
          duplicatesScanning: 'Running: scanning the full bookmark library...',
          duplicatesNone: 'Scan complete: no duplicate bookmarks found.',
          duplicatesDone: 'Scan complete: {{count}} duplicate URL groups found.',
          duplicatesLastStatusZero: 'Last scan: 0 duplicates',
          duplicatesLastStatus: 'Last scan: {{count}} duplicate groups',
          duplicatesClean: 'Delete Selected',
          duplicatesConfirm: 'Delete the selected {{count}} duplicate bookmarks?',
          duplicatesRescan: 'Scan Again',
          statsTitle: 'Bookmark Stats',
          statsDesc: 'Analyze bookmark structure, depth, and domains',
          statsIdle: 'Status: not analyzed yet',
          statsStart: 'Analyze',
          statsWarning: '💡 Generates a local structural and health report for your bookmark library, including top domains.',
          statsCollecting: 'Running: collecting data...',
          statsDone: 'Analysis complete',
          statsTotalBookmarks: 'Bookmarks',
          statsTotalFolders: 'Folders',
          statsMaxDepth: 'Max Depth',
          statsEmptyFolders: 'Empty Folders',
          statsTopDomains: 'Top 10 Domains',
          statsStructureHealth: 'Structure Health',
          statsDuplicateLinks: 'Duplicate Links',
          statsLargestFolder: 'Largest Folder',
          statsNone: 'None',
          statsGroups: '{{count}} groups',
          statsItems: '{{count}} items',
          statsCountLabel: '{{count}} bookmarks total',
          statsReanalyze: 'Analyze Again',
          brokenTitle: 'Check Broken Links',
          brokenDesc: 'Probe bookmark links that are no longer reachable',
          brokenIdle: 'Status: not scanned yet',
          brokenStart: 'Start Check',
          brokenWarning: '⚠️ Strategy: probe with HEAD first, retry by confidence level, and mark uncertain links for manual review to avoid false deletes.',
          brokenCollecting: 'Running: collecting all links...',
          brokenModuleMissing: 'Status: tools module is unavailable, cannot run detection',
          brokenModuleMissingResult: 'Reload the extension and try again',
          brokenRetry: 'Check Again',
          brokenNoHttp: 'Scan complete: no valid HTTP(S) links found to inspect.',
          brokenPreparing: 'Running: found {{count}} links, preparing probes. This may take about a minute.',
          brokenCancel: 'Cancel Check',
          brokenCancelled: 'Check cancelled ({{completed}}/{{total}})',
          brokenCancelledResult: 'This check was cancelled',
          brokenProgress: 'Running: probing {{completed}}/{{total}}...',
          brokenAllGood: 'Scan complete: all {{count}} links are reachable. {{suffix}}',
          brokenAllGoodResult: '🎉 All links look good!',
          brokenLastStatusClean: 'Last scan: no broken links found',
          brokenDoneMixed: 'Scan complete: {{broken}} confirmed broken, {{uncertain}} need review. {{suffix}}',
          brokenDoneReviewOnly: 'Scan complete: no high-confidence broken links found, {{uncertain}} need review. {{suffix}}',
          brokenLastStatus: 'Last scan: {{broken}} confirmed broken / {{uncertain}} review needed',
          brokenCacheSuffix: '(reused {{count}} cached results)',
          brokenConfirmedGroup: 'Confirmed Broken',
          brokenReviewGroup: 'Needs Review (cross-origin, anti-bot, or network issues possible)',
          brokenClean: 'Delete Selected',
          brokenConfirmDelete: 'Delete the selected {{count}} links?',
          brokenReviewHint: 'All selected items still need review. Confirm manually before deleting.',
          brokenDangerHint: 'High-confidence broken links are included, but a quick manual review is still recommended.',
          emptyFoldersTitle: 'Clean Empty Folders',
          emptyFoldersDesc: 'Remove folders that no longer contain items',
          emptyFoldersIdle: 'Status: not analyzed yet',
          emptyFoldersStart: 'Start Scan',
          emptyFoldersWarning: '💡 Finds and permanently removes folders that contain neither bookmarks nor any valid child folders.',
          emptyFoldersScanning: 'Running: scanning structure...',
          emptyFoldersNone: 'Scan complete: no empty folders found.',
          emptyFoldersDone: 'Scan complete: found {{count}} empty folders.',
          emptyFoldersLastStatusZero: 'Last scan: 0 empty folders',
          emptyFoldersLastStatus: 'Last scan: {{count}} empty folders',
          emptyFoldersClean: 'Delete Selected',
          emptyFoldersConfirm: 'Delete the selected {{count}} empty folders?',
          batchReplaceTitle: 'Batch Replace URL',
          batchReplaceDesc: 'Find and replace parts of bookmark URLs',
          batchReplaceRuleTitle: 'Find and Replace Rule',
          batchReplaceFindPlaceholder: 'Find text (for example: old-domain.com)',
          batchReplaceReplacePlaceholder: 'Replace with (leave empty to remove matches)',
          batchReplaceScope: 'Scope: all bookmark URLs',
          batchReplacePreview: 'Preview Changes',
          batchReplaceHintTitle: 'Hint',
          batchReplaceHint: 'Enter find and replace text above, then click "Preview Changes".',
          batchReplaceWarning: '⚠️ <strong>Risk:</strong> replacement cannot be undone. Preview the results carefully first.',
          batchReplaceReadyHint: 'A find rule is ready. Click "Preview Changes" to inspect replacements.',
          batchReplaceScanning: 'Scanning...',
          batchReplacePreviewing: '<div class="url-inline-spinner"><svg class="spin-icon" viewBox="0 0 24 24" fill="none" width="14" height="14" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Building preview...</div>',
          batchReplaceNone: 'No replaceable URLs found',
          batchReplaceResultTitle: 'Scan Result',
          batchReplaceResultText: 'Found {{count}} replaceable URLs. Review the changes below carefully:',
          batchReplacePreviewTitle: 'Preview Sample (first {{count}})',
          batchReplaceMore: '...and {{count}} more',
          batchReplaceEditRule: 'Edit Rule',
          batchReplaceConfirm: 'Replace {{count}}',
          batchReplaceRepreview: 'Preview Again',
          batchReplaceBackToEdit: 'Returned to edit mode. Adjust the rule and preview again.',
          batchReplaceConfirmPrompt: 'Replace these {{count}} URLs?',
          batchReplaceConfirmOk: 'Replace',
          batchReplaceRunning: '<div class="url-inline-spinner"><svg class="spin-icon" viewBox="0 0 24 24" fill="none" width="14" height="14" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Replacing...</div>',
          batchReplaceExecuting: 'Applying replacements...',
          batchReplaceDone: '🎉 Replaced {{count}} URLs successfully',
          batchReplaceLastStatus: 'Last replace: {{count}} items',
          batchReplaceDoneButton: 'Done',
          scanCleanWorking: 'Working: removing selected items...',
          cleanRunning: 'Deleting...',
          statusRunning: 'Working...',
          cleanLibrary: '🎉 Your bookmark library is very clean!'
        },
        reasons: {
          unknown: 'Unknown reason',
          http404: 'HTTP 404 (Not Found)',
          http410: 'HTTP 410 (Gone)',
          http451: 'HTTP 451 (Unavailable for Legal Reasons)',
          networkFailure: 'Network request failed',
          timeout: 'Request timed out',
          headBlocked: 'HEAD request blocked',
          headInconclusive: 'HEAD result was inconclusive',
          opaqueGet: 'Reachable only with no-cors (needs review)'
        }
      },
      newtab: {
        pageTitle: 'New Tab',
        wallpaperStoryTitle: 'Click to read the wallpaper story',
        closeStory: 'Close',
        favoriteWallpaper: 'Favorite this wallpaper',
        unfavoriteWallpaper: 'Remove favorite',
        refreshWallpaper: 'Refresh wallpaper (right-click to change source)',
        refreshWallpaperAria: 'Refresh wallpaper',
        providers: {
          bing: 'Bing Home',
          nasa: 'NASA APOD',
          picsum: 'Endless Random',
          favorites: 'Favorites'
        },
        nasaApi: {
          title: 'NASA API Key',
          configure: 'Set Key',
          reset: 'Default',
          modalTitle: 'Configure NASA API Key',
          placeholder: 'Enter your NASA API Key',
          hintHtml: 'Uses the default <code>DEMO_KEY</code> by default, which has rate limits. You can also enter your own NASA API Key; it is stored only in this browser.',
          modalHintHtml: 'Leave blank to restore the default <code>DEMO_KEY</code>. If you have your own NASA API Key, enter it and save; it will stay local to this browser.',
          usingDefault: 'Using default key: {{key}}',
          usingCustom: 'Using custom key: {{key}}',
          resetConfirm: 'Restore the default DEMO_KEY?'
        },
        notices: {
          favoritesEmptyFallback: 'No favorite wallpapers yet. Automatically fell back to Bing Home.',
          nasaRateLimitDefaultFallback: 'The default NASA DEMO_KEY hit its rate limit, so the page temporarily fell back to Bing. Try again later or add your own NASA API Key.',
          nasaRateLimitCustomFallback: 'The current NASA API Key hit its rate limit, so the page temporarily fell back to Bing. Try again later or switch to another key.',
          providerFallbackGeneric: 'The current wallpaper source is temporarily unavailable, so the page fell back to Bing Home.'
        },
        today: 'Today',
        clearFavorites: 'Clear',
        clearFavoritesConfirm: 'Clear all favorited wallpapers? This cannot be undone.'
      }
    }
  };

  function detectLocale() {
    const uiLang = (global.chrome && global.chrome.i18n && typeof global.chrome.i18n.getUILanguage === 'function')
      ? global.chrome.i18n.getUILanguage()
      : (global.navigator && (global.navigator.language || global.navigator.userLanguage)) || 'en';
    return /^zh\b/i.test(uiLang) ? 'zh_CN' : 'en';
  }

  function resolvePath(obj, key) {
    return String(key || '')
      .split('.')
      .reduce((acc, part) => (acc && Object.prototype.hasOwnProperty.call(acc, part) ? acc[part] : undefined), obj);
  }

  function interpolate(template, params) {
    return String(template == null ? '' : template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, token) => {
      const value = params && Object.prototype.hasOwnProperty.call(params, token) ? params[token] : '';
      return value == null ? '' : String(value);
    });
  }

  const locale = detectLocale();

  function t(key, params, fallback) {
    const localeMessages = messages[locale] || messages.zh_CN;
    const fallbackMessages = messages.zh_CN;
    const value = resolvePath(localeMessages, key);
    const fallbackValue = resolvePath(fallbackMessages, key);
    const resolved = value != null ? value : (fallbackValue != null ? fallbackValue : fallback);
    return interpolate(resolved == null ? key : resolved, params);
  }

  function apply(root) {
    const container = root || global.document;
    if (!container || !container.querySelectorAll) return;

    container.querySelectorAll('[data-i18n]').forEach((node) => {
      node.textContent = t(node.getAttribute('data-i18n'));
    });
    container.querySelectorAll('[data-i18n-html]').forEach((node) => {
      node.innerHTML = t(node.getAttribute('data-i18n-html'));
    });
    container.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
      node.setAttribute('placeholder', t(node.getAttribute('data-i18n-placeholder')));
    });
    container.querySelectorAll('[data-i18n-title]').forEach((node) => {
      node.setAttribute('title', t(node.getAttribute('data-i18n-title')));
    });
    container.querySelectorAll('[data-i18n-aria-label]').forEach((node) => {
      node.setAttribute('aria-label', t(node.getAttribute('data-i18n-aria-label')));
    });

    if (global.document && global.document.documentElement) {
      global.document.documentElement.lang = locale === 'zh_CN' ? 'zh-CN' : 'en';
    }
  }

  function setDocumentTitle(key, params, fallback) {
    if (!global.document) return;
    global.document.title = t(key, params, fallback);
  }

  global.JadeI18n = {
    locale,
    messages,
    t,
    html: t,
    apply,
    setDocumentTitle
  };
})(window);
