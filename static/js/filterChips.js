window.FilterChips = (function () {
  var CHIP_DEFINITIONS = [
    // Listing type
    { label: 'Lots', exclusion: '-lot', group: 'listing' },
    { label: 'Reprints', exclusion: '-reprint', group: 'listing' },
    { label: 'Digital', exclusion: '-digital', group: 'listing' },
    { label: 'Breaks', exclusion: '-break', group: 'listing' },
    { label: 'Mystery', exclusion: '-mystery', group: 'listing' },
    // Card type
    { label: 'Autos', exclusion: '-auto', group: 'card_type' },
    { label: 'Relics', exclusion: '-relic', group: 'card_type' },
    { label: 'Patches', exclusion: '-patch', group: 'card_type' },
    { label: 'Jerseys', exclusion: '-jersey', group: 'card_type' },
    { label: 'Inserts', exclusion: '-insert', group: 'card_type' },
    // Parallels
    { label: 'Parallels', exclusion: '-parallel', group: 'parallels' },
    { label: 'Refractors', exclusion: '-refractor', group: 'parallels' },
    { label: 'Prizms', exclusion: '-prizm', group: 'parallels' }
  ];

  var containerEl = null;

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function isChipApplied(exclusion, queryText) {
    var pattern = new RegExp('(^|\\s)' + escapeRegex(exclusion) + '(?=\\s|$)', 'i');
    return pattern.test(queryText);
  }

  function isChipRelevant(chip) {
    if (chip.group === 'parallels') {
      var baseOnly = document.getElementById('base_only');
      var baseRefractorOnly = document.getElementById('base_refractor_only');
      if (baseOnly && baseOnly.checked) return false;
      if (baseRefractorOnly && baseRefractorOnly.checked && chip.exclusion === '-refractor') return false;
    }
    return true;
  }

  function render() {
    containerEl = containerEl || document.getElementById('filter-chips-container');
    if (!containerEl) return;

    var queryInput = document.getElementById('query');
    if (!queryInput) return;
    var queryText = queryInput.value;

    var visibleChips = CHIP_DEFINITIONS.filter(function (chip) {
      return isChipRelevant(chip);
    });

    if (visibleChips.length === 0) {
      containerEl.innerHTML = '';
      return;
    }

    var html = '<div class="filter-chips-bar">' +
      '<span class="filter-chips-label">Exclude:</span>';

    for (var i = 0; i < visibleChips.length; i++) {
      var chip = visibleChips[i];
      var applied = isChipApplied(chip.exclusion, queryText);
      html += '<button class="filter-chip' + (applied ? ' applied' : '') +
        '" type="button" data-exclusion="' + chip.exclusion + '">' +
        chip.label +
        (applied ? ' <span class="filter-chip-remove">\u00d7</span>' : '') +
        '</button>';
    }

    html += '</div>';
    containerEl.innerHTML = html;

    var chipBtns = containerEl.querySelectorAll('.filter-chip');
    for (var j = 0; j < chipBtns.length; j++) {
      chipBtns[j].addEventListener('click', handleChipClick);
    }
  }

  function handleChipClick(e) {
    var btn = e.currentTarget;
    var exclusion = btn.getAttribute('data-exclusion');
    if (!exclusion) return;

    if (btn.classList.contains('applied')) {
      removeChip(exclusion);
    } else {
      applyChip(exclusion);
    }
  }

  function applyChip(exclusion) {
    var queryInput = document.getElementById('query');
    if (!queryInput) return;

    var current = queryInput.value.trim();
    queryInput.value = current + ' ' + exclusion;

    if (typeof runSearch === 'function') {
      runSearch();
    }
  }

  function removeChip(exclusion) {
    var queryInput = document.getElementById('query');
    if (!queryInput) return;

    var pattern = new RegExp('\\s*' + escapeRegex(exclusion) + '(?=\\s|$)', 'gi');
    queryInput.value = queryInput.value.replace(pattern, '').trim();

    if (typeof runSearch === 'function') {
      runSearch();
    }
  }

  function hide() {
    containerEl = containerEl || document.getElementById('filter-chips-container');
    if (containerEl) containerEl.innerHTML = '';
  }

  return { render: render, hide: hide };
})();
