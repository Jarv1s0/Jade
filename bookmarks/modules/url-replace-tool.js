(function initUrlReplaceToolModule(global) {
  'use strict';

  function updateBookmarkUrlAsync(chromeApi, bookmarkId, url) {
    return new Promise((resolve, reject) => {
      chromeApi.bookmarks.update(bookmarkId, { url }, () => {
        const runtimeError = chromeApi.runtime && chromeApi.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message || 'Unknown bookmark error'));
          return;
        }
        resolve();
      });
    });
  }

  function getFailureReason(error) {
    if (error && typeof error === 'object' && typeof error.message === 'string' && error.message) {
      return error.message;
    }
    return String(error || 'Unknown reason');
  }

  function bindUrlReplaceTool(deps) {
    const {
      chromeApi,
      t,
      escapeHtml,
      escapeHtmlAttr,
      btnBatchReplaceUrl,
      toolDetailMainAction,
      toolDetailStatus,
      toolDetailWarning,
      toolDetailFooter,
      toolsResultList,
      getBookmarkTreeCached,
      confirmDangerAction,
      refreshView,
      openToolView,
      closeToolView
    } = deps;

    if (!btnBatchReplaceUrl) return;

    btnBatchReplaceUrl.addEventListener('click', () => {
      openToolView(t('popup.tools.batchReplaceTitle', null, 'Batch Replace URL'));
      toolDetailMainAction.style.display = 'none';
      toolDetailStatus.style.display = 'none';

      toolsResultList.innerHTML = `
        <div id="urlReplaceRuleArea" class="url-replace-rule-area">
          <div class="url-replace-title">${escapeHtml(t('popup.tools.batchReplaceRuleTitle', null, 'Find and Replace Rule'))}</div>
          <input type="text" id="urlFindTarget" placeholder="${escapeHtmlAttr(t('popup.tools.batchReplaceFindPlaceholder', null, 'Find text (for example: old-domain.com)'))}" class="search-input url-replace-input" spellcheck="false" autocomplete="off">
          <input type="text" id="urlReplaceTarget" placeholder="${escapeHtmlAttr(t('popup.tools.batchReplaceReplacePlaceholder', null, 'Replace with (leave empty to remove matches)'))}" class="search-input url-replace-input" spellcheck="false" autocomplete="off">
          <div class="url-replace-scope">${escapeHtml(t('popup.tools.batchReplaceScope', null, 'Scope: all bookmark URLs'))}</div>
          <button id="btnStartUrlPreview" class="tool-btn tool-btn-primary url-replace-preview-btn" disabled>${escapeHtml(t('popup.tools.batchReplacePreview', null, 'Preview Changes'))}</button>
        </div>

        <div id="urlStatusArea" class="url-status-area">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="url-status-icon"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
          <div>
            <div class="url-status-heading">${escapeHtml(t('popup.tools.batchReplaceHintTitle', null, 'Hint'))}</div>
            <div id="urlStatusText" class="url-status-text">${escapeHtml(t('popup.tools.batchReplaceHint', null, 'Enter find and replace text above, then click "Preview Changes".'))}</div>
          </div>
        </div>

        <div id="urlPreviewArea" class="url-preview-area is-hidden"></div>
      `;

      toolDetailWarning.style.display = 'block';
      toolDetailWarning.innerHTML = t('popup.tools.batchReplaceWarning', null, '⚠️ <strong>Risk:</strong> replacement cannot be undone. Preview the results carefully first.');

      const ruleArea = document.getElementById('urlReplaceRuleArea');
      const findInput = document.getElementById('urlFindTarget');
      const replaceInput = document.getElementById('urlReplaceTarget');
      const previewBtn = document.getElementById('btnStartUrlPreview');
      const statusArea = document.getElementById('urlStatusArea');
      const statusText = document.getElementById('urlStatusText');
      const previewArea = document.getElementById('urlPreviewArea');

      findInput.addEventListener('input', () => {
        if (findInput.value.trim().length > 0) {
          previewBtn.disabled = false;
          statusText.style.color = 'var(--text-secondary)';
          statusText.innerHTML = t('popup.tools.batchReplaceReadyHint', null, 'A find rule is ready. Click "Preview Changes" to inspect replacements.');
        } else {
          previewBtn.disabled = true;
          statusText.style.color = 'var(--text-secondary)';
          statusText.innerHTML = t('popup.tools.batchReplaceHint', null, 'Enter find and replace text above, then click "Preview Changes".');
        }
      });

      previewBtn.addEventListener('click', () => {
        const findStr = findInput.value;
        const replaceStr = replaceInput.value;
        if (!findStr) return;

        findInput.disabled = true;
        replaceInput.disabled = true;
        previewBtn.disabled = true;
        previewBtn.textContent = t('popup.tools.batchReplaceScanning', null, 'Scanning...');
        statusArea.style.color = 'var(--text-secondary)';
        statusArea.innerHTML = t('popup.tools.batchReplacePreviewing', null, '<div class="url-inline-spinner">Previewing...</div>');
        previewArea.style.display = 'none';
        toolDetailFooter.style.display = 'none';

        setTimeout(() => {
          getBookmarkTreeCached((tree) => {
            const matches = [];
            function traverse(nodes) {
              nodes.forEach((node) => {
                if (node.url && node.url.includes(findStr)) {
                  matches.push({
                    node,
                    oldUrl: node.url,
                    newUrl: node.url.split(findStr).join(replaceStr)
                  });
                }
                if (node.children) traverse(node.children);
              });
            }
            traverse(tree);

            if (matches.length === 0) {
              findInput.disabled = false;
              replaceInput.disabled = false;
              previewBtn.disabled = false;
              previewBtn.textContent = t('popup.tools.batchReplacePreview', null, 'Preview Changes');
              statusArea.style.color = 'var(--text-secondary)';
              statusArea.innerHTML = t('popup.tools.batchReplaceNone', null, 'No replaceable URLs found');
              return;
            }

            ruleArea.style.display = 'none';
            statusArea.style.display = 'none';
            previewArea.style.display = 'flex';

            const previewMatches = matches.slice(0, 5);
            let html = `<div class="url-preview-summary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" class="url-preview-summary-icon"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          <div>
            <div class="url-preview-summary-title">${escapeHtml(t('popup.tools.batchReplaceResultTitle', null, 'Scan Result'))}</div>
            <div class="url-preview-summary-text">${escapeHtml(t('popup.tools.batchReplaceResultText', { count: matches.length }, `Found ${matches.length} replaceable URLs. Review the changes below carefully:`))}</div>
          </div>
        </div>`;

            html += `<div class="url-preview-title">${escapeHtml(t('popup.tools.batchReplacePreviewTitle', { count: previewMatches.length }, `Preview Sample (first ${previewMatches.length})`))}</div>`;
            html += '<div class="url-preview-list">';
            previewMatches.forEach((item) => {
              html += `
                <div class="url-preview-item">
                  <div class="url-preview-item-title">${escapeHtml(item.node.title || t('common.untitled', null, 'Untitled'))}</div>
                  <div class="url-preview-old">- ${escapeHtml(item.oldUrl)}</div>
                  <div class="url-preview-new">+ ${escapeHtml(item.newUrl)}</div>
                </div>
              `;
            });
            if (matches.length > previewMatches.length) {
              html += `<div class="url-preview-more">${escapeHtml(t('popup.tools.batchReplaceMore', { count: matches.length - previewMatches.length }, `...and ${matches.length - previewMatches.length} more`))}</div>`;
            }
            html += '</div>';
            previewArea.innerHTML = html;

            toolDetailFooter.style.display = 'flex';
            toolDetailFooter.style.gap = '12px';
            toolDetailFooter.innerHTML = `
              <button id="btnEditRule" class="tool-btn tool-btn-secondary tool-flex-1">${escapeHtml(t('popup.tools.batchReplaceEditRule', null, 'Edit Rule'))}</button>
              <button id="btnConfirmReplace" class="tool-btn tool-btn-danger tool-flex-2">${escapeHtml(t('popup.tools.batchReplaceConfirm', { count: matches.length }, `Replace ${matches.length}`))}</button>
            `;

            const editBtn = document.getElementById('btnEditRule');
            const confirmBtn = document.getElementById('btnConfirmReplace');

            if (editBtn) {
              editBtn.addEventListener('click', () => {
                ruleArea.style.display = 'flex';
                findInput.disabled = false;
                replaceInput.disabled = false;
                previewBtn.disabled = false;
                previewBtn.textContent = t('popup.tools.batchReplaceRepreview', null, 'Preview Again');
                statusArea.style.display = 'flex';
                statusText.innerHTML = t('popup.tools.batchReplaceBackToEdit', null, 'Returned to edit mode. Adjust the rule and preview again.');
                previewArea.style.display = 'none';
                toolDetailFooter.style.display = 'none';
              });
            }

            if (!confirmBtn) return;
            confirmBtn.addEventListener('click', async (eConfirm) => {
              const confirmButton = eConfirm.target;
              if (!(await confirmDangerAction(
                t('popup.tools.batchReplaceConfirmPrompt', { count: matches.length }, `Replace these ${matches.length} URLs?`),
                { okText: t('popup.tools.batchReplaceConfirmOk', null, 'Replace') }
              ))) return;

              confirmButton.disabled = true;
              if (editBtn) editBtn.disabled = true;
              confirmButton.innerHTML = t('popup.tools.batchReplaceRunning', null, '<div class="url-inline-spinner">Replacing...</div>');
              statusArea.style.display = 'flex';
              statusArea.style.color = 'var(--text-secondary)';
              statusText.innerHTML = t('popup.tools.batchReplaceExecuting', null, 'Applying replacements...');

              const setReplaceStatus = (color, message) => {
                statusArea.style.color = color;
                statusText.innerHTML = message;
              };
              const setReplaceCount = (count) => {
                document.getElementById('statusReplaceUrl').textContent = t('popup.tools.batchReplaceLastStatus', { count }, `Last replace: ${count} items`);
              };

              const results = await Promise.allSettled(
                matches.map((item) => updateBookmarkUrlAsync(chromeApi, item.node.id, item.newUrl))
              );
              const failed = results.filter((result) => result.status === 'rejected');
              const successCount = results.length - failed.length;
              const firstReason = failed.length > 0 ? getFailureReason(failed[0].reason) : '';

              refreshView();

              if (failed.length === 0) {
                setReplaceStatus('#34c759', t('popup.tools.batchReplaceDone', { count: successCount }, `🎉 Replaced ${successCount} URLs successfully`));
                setReplaceCount(successCount);
              } else if (successCount > 0) {
                setReplaceStatus('#d97706', t(
                  'popup.tools.batchReplacePartial',
                  { success: successCount, failed: failed.length, reason: firstReason },
                  `Replaced ${successCount} URLs, ${failed.length} failed (${firstReason})`
                ));
                setReplaceCount(successCount);
              } else {
                setReplaceStatus('#ff3b30', t('popup.tools.batchReplaceFailed', { reason: firstReason }, `Replace failed: ${firstReason}`));
                confirmButton.disabled = false;
                if (editBtn) editBtn.disabled = false;
                confirmButton.textContent = t('popup.tools.batchReplaceConfirm', { count: matches.length }, `Replace ${matches.length}`);
                return;
              }

              confirmButton.style.display = 'none';
              if (editBtn) editBtn.style.display = 'none';

              const doneBtn = document.createElement('button');
              doneBtn.className = 'tool-btn tool-btn-primary';
              doneBtn.classList.add('tool-flex-1');
              doneBtn.textContent = t('popup.tools.batchReplaceDoneButton', null, 'Done');
              doneBtn.onclick = () => {
                closeToolView();
                refreshView();
              };
              toolDetailFooter.appendChild(doneBtn);
            });
          });
        }, 300);
      });
    });
  }

  global.JadeModules = global.JadeModules || {};
  global.JadeModules.urlReplaceTool = {
    bindUrlReplaceTool
  };
})(window);
