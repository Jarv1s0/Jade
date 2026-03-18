# Changelog

## 2026-03-18

### Added
- Added English support for the extension UI, including bookmark popup, toolbox, and new tab page.
- Added Chrome extension locale resources under `_locales/zh_CN` and `_locales/en`.
- Added a shared lightweight i18n runtime in `shared/i18n.js`.

### Changed
- Updated the localized extension name:
  - `zh_CN`: `Jade - 书签管理与新标签页助手`
  - `en`: `Jade - Bookmark Manager & New Tab`
- Refined the localized extension description for both `zh_CN` and `en`.
- Switched pinned bookmark preferences to stable cross-device keys instead of machine-specific bookmark IDs.
- Moved pinned items and pinned ordering to synced storage when available.
- Moved custom pinned titles and custom pinned URLs to synced storage when available.
- Kept Bing wallpapers on `bing.ee123.net` for Chinese locale to preserve historical coverage and local stability.
- Switched the English Bing wallpaper path to the official/global Bing endpoint and added locale-aware cache separation.
- Added an English fallback localization step for Bing titles, copyright text, and story content when upstream metadata still resolves to Chinese.

### Fixed
- Fixed pinned items appearing empty across different computers due to local-only storage and unstable bookmark IDs.
- Added migration for legacy local pinned data and older custom title/url mappings.
- Reduced collisions for custom titles on different bookmarks from the same domain.
