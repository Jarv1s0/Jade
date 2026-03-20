# Changelog

## 2026-03-20

### Added
- Added local release automation under `release/`, including `build.ps1` and `clean-release.ps1`.
- Added a dedicated provider module for the new tab wallpaper sources under `newtab/modules/providers.js`.
- Added local NASA API Key management UI and localized fallback notices on the new tab page.
- Added modular toolbox helpers for the bookmarks popup under `bookmarks/modules/toolbox-view.js` and `bookmarks/modules/url-replace-tool.js`.

### Changed
- Moved new tab wallpaper source fetching out of `newtab/script.js` into a provider layer to simplify future source switching and API changes.
- Updated the new tab source menu so the NASA API panel only appears when the NASA source is selected.
- Unified key interaction styles between the new tab page and the bookmarks popup, including modal overlay, focus, button, and selection treatments.
- Standardized the four new tab provider option rows to use the same layout structure and selection sizing.
- Updated the local packaging flow so `build.ps1` can automatically keep only the latest generated package.
- Refined project docs and privacy copy to document local packaging and local-only NASA API Key storage.

### Fixed
- Fixed the new tab source option rows having inconsistent visual selection areas.
- Fixed silent fallback cases on the new tab page by surfacing clear notices when Favorites is empty or NASA hits rate limits.
- Fixed package validation gaps by keeping manifest and HTML asset checks in the local release workflow.

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
