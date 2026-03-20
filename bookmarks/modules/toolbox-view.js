(function initToolboxViewModule(global) {
  'use strict';

  function createToolboxViewController(deps) {
    const {
      t,
      toolsTitle,
      toolsBackBtn,
      toolsMenuView,
      toolsDetailView,
      toolsResultList,
      toolDetailStatus,
      toolDetailMainAction,
      toolDetailWarning,
      toolDetailFooter,
      cancelBrokenLinkScanSilently
    } = deps;

    function resetToolDetailLayout() {
      toolDetailStatus.style.display = 'none';
      toolDetailStatus.innerHTML = '';
      toolDetailMainAction.style.display = '';
      toolDetailMainAction.innerHTML = '';
      toolDetailWarning.style.display = 'none';
      toolDetailWarning.innerHTML = '';
      toolDetailFooter.style.display = 'none';
      toolDetailFooter.style.justifyContent = '';
      toolDetailFooter.style.gap = '';
      toolDetailFooter.innerHTML = '';
      toolsResultList.innerHTML = '';
    }

    function openToolView(titleStr) {
      toolsMenuView.classList.remove('active');
      toolsDetailView.classList.add('active');
      toolsMenuView.style.display = 'none';
      toolsDetailView.style.display = 'block';
      toolsTitle.textContent = titleStr;
      toolsBackBtn.style.visibility = 'visible';
      resetToolDetailLayout();
    }

    function closeToolView() {
      cancelBrokenLinkScanSilently();
      toolsDetailView.classList.remove('active');
      toolsMenuView.classList.add('active');
      toolsDetailView.style.display = 'none';
      toolsMenuView.style.display = 'block';
      toolsTitle.textContent = t('popup.tools.toolboxTitle', null, 'Bookmark Toolbox');
      toolsBackBtn.style.visibility = 'hidden';
      resetToolDetailLayout();
    }

    return {
      openToolView,
      closeToolView,
      resetToolDetailLayout
    };
  }

  global.JadeModules = global.JadeModules || {};
  global.JadeModules.toolboxView = {
    createToolboxViewController
  };
})(window);
