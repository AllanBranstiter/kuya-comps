window.RecentSearches = (function () {
  const STORAGE_KEY = 'kuyacomps_recent_searches';
  const MAX_ENTRIES = 10;

  let dropdownEl = null;
  let queryInput = null;
  let wrapperEl = null;

  // --- Storage ---

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function save(entries) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Storage full or unavailable — degrade silently
    }
  }

  function addEntry(query, filters) {
    if (!query || !query.trim()) return;
    const trimmed = query.trim();
    let entries = load();

    // Dedup: remove existing entry with same query + filters
    entries = entries.filter(function (e) {
      return !(e.query === trimmed && filtersMatch(e.filters, filters));
    });

    entries.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      query: trimmed,
      filters: filters || {},
      timestamp: Date.now()
    });

    if (entries.length > MAX_ENTRIES) {
      entries = entries.slice(0, MAX_ENTRIES);
    }

    save(entries);
  }

  function removeEntry(id) {
    var entries = load().filter(function (e) { return e.id !== id; });
    save(entries);
  }

  function clearAll() {
    save([]);
  }

  function filtersMatch(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.ungraded_only === b.ungraded_only &&
      a.base_only === b.base_only &&
      a.base_chrome_only === b.base_chrome_only &&
      a.base_refractor_only === b.base_refractor_only;
  }

  // --- Relative time ---

  function formatRelativeTime(timestamp) {
    var diff = Date.now() - timestamp;
    var seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'just now';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    var days = Math.floor(hours / 24);
    if (days < 30) return days + 'd ago';
    return Math.floor(days / 30) + 'mo ago';
  }

  // --- Filter labels ---

  var FILTER_LABELS = {
    ungraded_only: 'Raw',
    base_only: 'Base',
    base_chrome_only: 'Chrome',
    base_refractor_only: 'Refractor'
  };

  function getFilterLabels(filters) {
    if (!filters) return '';
    var labels = [];
    for (var key in FILTER_LABELS) {
      if (filters[key]) labels.push(FILTER_LABELS[key]);
    }
    return labels.join(', ');
  }

  // --- Render ---

  function render() {
    var entries = load();
    if (!dropdownEl) return;

    if (entries.length === 0) {
      dropdownEl.innerHTML = '';
      return;
    }

    var html = '<div class="recent-searches-header">' +
      '<span>Recent Searches</span>' +
      '<button class="recent-searches-clear-all" type="button">Clear All</button>' +
      '</div>' +
      '<div class="recent-searches-list">';

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var filterText = getFilterLabels(entry.filters);
      var timeText = formatRelativeTime(entry.timestamp);

      html += '<div class="recent-search-entry" role="option" tabindex="-1" data-index="' + i + '">' +
        '<div class="recent-search-info">' +
        '<span class="recent-search-query"></span>' +
        '<span class="recent-search-meta">' +
        (filterText ? '<span class="recent-search-filters">' + escapeForDisplay(filterText) + '</span>' : '') +
        '<span class="recent-search-time">' + escapeForDisplay(timeText) + '</span>' +
        '</span>' +
        '</div>' +
        '<button class="recent-search-remove" type="button" aria-label="Remove" data-id="' + escapeForDisplay(entry.id) + '">\u00d7</button>' +
        '</div>';
    }

    html += '</div>';
    dropdownEl.innerHTML = html;

    // Set query text via textContent to prevent XSS
    var querySpans = dropdownEl.querySelectorAll('.recent-search-query');
    for (var j = 0; j < entries.length; j++) {
      if (querySpans[j]) {
        querySpans[j].textContent = entries[j].query;
      }
    }

    // Bind entry clicks
    var entryEls = dropdownEl.querySelectorAll('.recent-search-entry');
    for (var k = 0; k < entryEls.length; k++) {
      (function (idx) {
        entryEls[idx].addEventListener('pointerdown', function (e) {
          if (e.target.closest('.recent-search-remove')) return;
          e.preventDefault();
          selectEntry(entries[idx]);
        });
      })(k);
    }

    // Bind remove buttons
    var removeBtns = dropdownEl.querySelectorAll('.recent-search-remove');
    for (var m = 0; m < removeBtns.length; m++) {
      (function (btn) {
        btn.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var id = btn.getAttribute('data-id');
          removeEntry(id);
          render();
          if (load().length === 0) hide();
        });
      })(removeBtns[m]);
    }

    // Bind clear all
    var clearBtn = dropdownEl.querySelector('.recent-searches-clear-all');
    if (clearBtn) {
      clearBtn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        clearAll();
        render();
        hide();
      });
    }
  }

  function escapeForDisplay(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Show / Hide ---

  function show() {
    var entries = load();
    if (entries.length === 0 || !dropdownEl) return;
    render();
    dropdownEl.removeAttribute('hidden');
  }

  function hide() {
    if (dropdownEl) dropdownEl.setAttribute('hidden', '');
  }

  function isVisible() {
    return dropdownEl && !dropdownEl.hasAttribute('hidden');
  }

  // --- Entry selection ---

  function selectEntry(entry) {
    if (!queryInput) return;
    queryInput.value = entry.query;

    // Restore checkbox states
    var checkboxMap = {
      ungraded_only: 'ungraded_only',
      base_only: 'base_only',
      base_chrome_only: 'base_chrome_only',
      base_refractor_only: 'base_refractor_only'
    };
    for (var key in checkboxMap) {
      var cb = document.getElementById(checkboxMap[key]);
      if (cb) cb.checked = !!(entry.filters && entry.filters[key]);
    }

    hide();

    if (typeof runSearch === 'function') {
      runSearch();
    }
  }

  // --- Keyboard navigation ---

  function handleKeydown(e) {
    if (!isVisible()) return;

    var entries = dropdownEl.querySelectorAll('.recent-search-entry');
    if (entries.length === 0) return;

    var focused = dropdownEl.querySelector('.recent-search-entry:focus');
    var focusedIndex = -1;
    if (focused) {
      focusedIndex = parseInt(focused.getAttribute('data-index'), 10);
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      var nextIndex = focusedIndex < entries.length - 1 ? focusedIndex + 1 : 0;
      entries[nextIndex].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (focusedIndex <= 0) {
        queryInput.focus();
        return;
      }
      entries[focusedIndex - 1].focus();
    } else if (e.key === 'Enter' && focused) {
      e.preventDefault();
      var idx = parseInt(focused.getAttribute('data-index'), 10);
      var allEntries = load();
      if (allEntries[idx]) selectEntry(allEntries[idx]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hide();
      queryInput.focus();
    }
  }

  // --- Init ---

  function init() {
    queryInput = document.getElementById('query');
    dropdownEl = document.getElementById('recent-searches-dropdown');
    wrapperEl = document.getElementById('query-wrapper');
    if (!queryInput || !dropdownEl) return;

    queryInput.addEventListener('click', function () {
      show();
    });

    queryInput.addEventListener('input', function () {
      hide();
    });

    queryInput.addEventListener('keydown', handleKeydown);
    dropdownEl.addEventListener('keydown', handleKeydown);

    // Prevent clicks inside the dropdown from stealing focus from the input,
    // so entry pointerdown handlers can fire before the dropdown hides.
    dropdownEl.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });

    // Dismiss on any click or tap anywhere outside the wrapper.
    // Uses capture phase so it runs before stopPropagation in child handlers.
    document.addEventListener('click', function (e) {
      if (!isVisible()) return;
      if (wrapperEl && !wrapperEl.contains(e.target)) {
        hide();
      }
    }, true);

    document.addEventListener('touchend', function (e) {
      if (!isVisible()) return;
      if (wrapperEl && !wrapperEl.contains(e.target)) {
        hide();
      }
    }, true);

    // Dismiss when switching browser tabs or the window loses focus.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) hide();
    });

    window.addEventListener('blur', function () {
      hide();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init: init, addEntry: addEntry, clearAll: clearAll, hide: hide };
})();
