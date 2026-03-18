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
- Switched pinned bookmark preferences to stable cross-device keys instead of machine-specific bookmark IDs.
- Moved pinned items and pinned ordering to synced storage when available.
- Moved custom pinned titles and custom pinned URLs to synced storage when available.

### Fixed
- Fixed pinned items appearing empty across different computers due to local-only storage and unstable bookmark IDs.
- Added migration for legacy local pinned data and older custom title/url mappings.
- Reduced collisions for custom titles on different bookmarks from the same domain.
