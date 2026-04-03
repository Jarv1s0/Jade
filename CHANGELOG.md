# Changelog

## 2026-04-02

### Changed
- Refined the popup footer layout, search field spacing, and shortcut hint styling for a cleaner bookmarks popup toolbar.
- Removed the popup search placeholder copy to reduce visual noise in the footer search field.

### Fixed
- Added visible progress and success or failure feedback for bookmark deletions triggered from the popup toolbox and context menu.
- Fixed duplicate cleanup results so the list refreshes immediately after deletion instead of keeping stale entries until a manual rescan.
- Fixed empty folder cleanup to clear stale action buttons when a follow-up scan finds no remaining folders.
- Fixed batch URL replace and bookmark export flows to surface partial failures and download errors instead of reporting false success.

## 2026-04-01

### Added
- Added a "History" button in the popup footer to open `chrome://history/` in one click.

### Changed
- Removed trailing ellipsis from the search placeholder text for a cleaner look.

## 2026-03-27

### Added
- Added an optional new tab search box with a local on/off toggle and localized menu copy.
- Added support for using Chrome's current default search engine from the new tab search box via the `search` extension permission.

### Changed
- Updated the new tab search box to a dark glass style and moved it higher to better match the native Chrome new tab visual balance.
- Updated the refresh button hint from "right-click to change source" to "right-click for settings".
- Refined the new tab source menu structure so wallpaper source, search toggle, and NASA API Key settings read more like a compact settings panel.

### Fixed
- Removed the blue square focus ring from the search input so focus feedback stays on the outer search field.
- Kept the NASA API Key title and content inside the same card to avoid split visual hierarchy in the settings menu.

## 2026-03-26

### Changed
- Bumped the extension version to `1.3`.

### Fixed
- Fixed the bookmarks popup sometimes staying open after clicking a bookmark link.
- Fixed inconsistent popup close behavior when reusing the current new tab for bookmark navigation.

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
