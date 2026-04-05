// --- Multi-select Component ---

/**
 * Set up a multi-select dropdown with pill/tag UI for a given container.
 * @param {string} containerId - DOM ID of the `.multi-select-container` wrapper
 * @param {Array} options - Available options (unit objects or trait name strings)
 * @param {boolean} [isUnit=true] - Whether options are unit objects (true) or plain strings (false)
 * @returns {{getValues: Function, setValues: Function, resolvePills: Function, destroy: Function}}
 */
function setupMultiSelect(containerId, options, isUnit = true) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`MultiSelect container not found: ${containerId}`);
        return { getValues: () => [], setValues: () => {}, resolvePills: () => {}, destroy: () => {} };
    }

    const previousController = container._multiSelectController;
    const preservedValues = previousController?.getValues ? previousController.getValues() : [];
    previousController?.destroy?.();

    const pillsContainer = container.querySelector('.pills');
    const input = container.querySelector('input');
    const dropdown = container.querySelector('.dropdown');
    pillsContainer.innerHTML = '';
    dropdown.innerHTML = '';
    dropdown.classList.add('hidden');
    
    let selectedValues = [];
    let filteredOptions = [];
    let highlightedIndex = -1;
    const controller = new AbortController();
    const { signal } = controller;
    const optionsByValue = new Map();

    function getOptionValue(option) {
        if (typeof option === 'string') return option;
        if (isUnit) return option?.id ?? option?.value ?? option?.name ?? '';
        return option?.value ?? option?.id ?? option?.name ?? '';
    }

    function getOptionLabel(option) {
        if (typeof option === 'string') return option;
        if (isUnit) return option.displayName || option.label || option.id || option.value;
        return option?.label ?? option?.displayName ?? option?.name ?? getOptionValue(option);
    }

    function getOptionPillLabel(option) {
        if (typeof option === 'string') return option;
        return option?.pillLabel ?? getOptionLabel(option);
    }

    function getOptionDropdownMeta(option) {
        if (typeof option === 'string') return '';
        return String(option?.dropdownMeta ?? '').trim();
    }

    function getOptionIconUrl(option) {
        if (typeof option === 'string') return null;
        return option?.iconUrl || null;
    }

    options.forEach((option) => {
        const value = getOptionValue(option);
        if (!value) return;
        optionsByValue.set(value, {
            value,
            label: getOptionLabel(option),
            pillLabel: getOptionPillLabel(option),
            dropdownMeta: getOptionDropdownMeta(option),
            iconUrl: getOptionIconUrl(option)
        });
    });

    function normalizeValues(values) {
        if (!Array.isArray(values)) return [];

        const seen = new Set();
        const normalized = [];
        values.forEach((value) => {
            const normalizedValue = String(value ?? '').trim();
            if (!normalizedValue || seen.has(normalizedValue)) return;
            seen.add(normalizedValue);
            normalized.push(normalizedValue);
        });
        return normalized;
    }

    function emitChange() {
        container.dispatchEvent(new CustomEvent('multiselectchange', {
            bubbles: true,
            detail: { values: [...selectedValues] }
        }));
    }

    function addPill(value, { emit = true } = {}) {
        const normalizedValue = getOptionValue(value);
        if (!normalizedValue || selectedValues.includes(normalizedValue)) return;
        selectedValues.push(normalizedValue);
        
        const pill = document.createElement('div');
        pill.className = 'pill';
        pill.dataset.value = normalizedValue;
        const label = document.createElement('span');
        label.className = 'pill-label';
        const optionMeta = optionsByValue.get(normalizedValue);
        const displayValue = optionMeta?.pillLabel || optionMeta?.label || normalizedValue;
        const iconUrl = optionMeta?.iconUrl;

        if (iconUrl) {
            const img = document.createElement('img');
            img.className = 'pill-icon option-icon';
            img.src = iconUrl;
            img.alt = displayValue;
            img.loading = 'lazy';
            pill.appendChild(img);
        }

        const text = document.createElement('span');
        text.className = 'pill-label-text';
        text.textContent = displayValue;
        label.appendChild(text);
        pill.appendChild(label);

        const remove = document.createElement('span');
        remove.className = 'remove';
        remove.innerHTML = '&times;';
        remove.addEventListener('click', () => {
            selectedValues = selectedValues.filter(v => v !== normalizedValue);
            pill.remove();
            emitChange();
            renderDropdown(input.value);
        }, { signal });
        pill.appendChild(remove);
        pillsContainer.appendChild(pill);
        if (emit) {
            emitChange();
        }
    }

    function renderDropdown(filter = '') {
        dropdown.innerHTML = '';
        filteredOptions = options.filter(opt => {
            const name = getOptionValue(opt);
            const label = getOptionLabel(opt);
            const meta = getOptionDropdownMeta(opt);
            const query = filter.toLowerCase();
            return (
                (`${name} ${label} ${meta}`.toLowerCase().includes(query)) &&
                !selectedValues.includes(name)
            );
        }).slice(0, 50);
        highlightedIndex = filteredOptions.length > 0 ? 0 : -1;

        if (filteredOptions.length === 0) {
            if (filter.trim().length > 0) {
                const empty = document.createElement('div');
                empty.className = 'dropdown-empty';
                empty.textContent = 'No matching options';
                dropdown.appendChild(empty);
                dropdown.classList.remove('hidden');
                return;
            }
            dropdown.classList.add('hidden');
            return;
        }

        filteredOptions.forEach((opt, index) => {
            const item = document.createElement('div');
            item.className = `dropdown-item${index === highlightedIndex ? ' dropdown-item-active' : ''}`;
            const name = getOptionValue(opt);
            const displayName = getOptionLabel(opt);
            const iconUrl = getOptionIconUrl(opt);
            const dropdownMeta = getOptionDropdownMeta(opt);

            if (iconUrl) {
                const img = document.createElement('img');
                img.className = 'pill-icon option-icon';
                img.src = iconUrl;
                img.alt = displayName;
                img.loading = 'lazy';
                item.appendChild(img);
            }

            const content = document.createElement('div');
            content.className = 'dropdown-item-content';

            const text = document.createElement('span');
            text.className = 'dropdown-item-label';
            text.textContent = displayName;
            content.appendChild(text);

            if (dropdownMeta) {
                const meta = document.createElement('span');
                meta.className = 'dropdown-item-meta';
                meta.textContent = dropdownMeta;
                content.appendChild(meta);
            }

            item.appendChild(content);

            item.addEventListener('click', () => {
                addPill(name);
                input.value = '';
                dropdown.classList.add('hidden');
            }, { signal });
            dropdown.appendChild(item);
        });
        dropdown.classList.remove('hidden');
    }

    function setValues(values) {
        selectedValues = [];
        pillsContainer.innerHTML = '';
        normalizeValues(values).forEach((value) => addPill(value, { emit: false }));
        emitChange();
        renderDropdown(input.value);
    }

    input.addEventListener('focus', () => renderDropdown(input.value), { signal });
    input.addEventListener('input', () => {
        renderDropdown(input.value);
        emitChange();
    }, { signal });
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Backspace' && input.value === '' && selectedValues.length > 0) {
            const lastValue = selectedValues[selectedValues.length - 1];
            selectedValues = selectedValues.slice(0, -1);
            const pills = Array.from(pillsContainer.querySelectorAll('.pill'));
            const lastPill = pills.reverse().find((pill) => pill.dataset.value === lastValue);
            lastPill?.remove();
            emitChange();
            renderDropdown(input.value);
            return;
        }

        if (event.key === 'Escape') {
            dropdown.classList.add('hidden');
            input.blur();
            return;
        }

        if (filteredOptions.length === 0 || dropdown.classList.contains('hidden')) {
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            highlightedIndex = (highlightedIndex + 1) % filteredOptions.length;
            renderDropdown(input.value);
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            highlightedIndex = (highlightedIndex - 1 + filteredOptions.length) % filteredOptions.length;
            renderDropdown(input.value);
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            const selected = filteredOptions[highlightedIndex];
            if (!selected) return;
            addPill(getOptionValue(selected));
            input.value = '';
            renderDropdown('');
        }
    }, { signal });
    
    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    }, { signal });

    const inputDefaults = input.value && input.value.includes('{')
        ? normalizeValues(input.value.split(','))
        : [];
    input.value = '';

    const initialValues = preservedValues.length > 0 ? preservedValues : inputDefaults;
    if (initialValues.length > 0) {
        setValues(initialValues);
    }

    const api = {
        getValues: () => [...selectedValues],
        setValues,
        resolvePills: (hashMap) => {
            const pills = pillsContainer.querySelectorAll('.pill');
            pills.forEach((pill) => {
                let currentValue = pill.dataset.value || '';
                if (currentValue.startsWith('{') && currentValue.endsWith('}')) {
                    const resolved = hashMap[currentValue];
                    if (resolved) {
                        const index = selectedValues.indexOf(currentValue);
                        if (index !== -1) selectedValues[index] = resolved;
                        pill.dataset.value = resolved;
                        currentValue = resolved;
                        const resolvedMeta = optionsByValue.get(resolved);
                        const labelText = pill.querySelector('.pill-label-text');
                        if (labelText) {
                            labelText.textContent = resolvedMeta?.pillLabel || resolvedMeta?.label || resolved;
                        }
                    }
                }

                if (!optionsByValue.has(currentValue)) {
                    selectedValues = selectedValues.filter((value) => value !== currentValue);
                    pill.remove();
                }
            });
            emitChange();
        },
        destroy: () => {
            controller.abort();
            delete container._multiSelectController;
        }
    };

    container._multiSelectController = api;
    return api;
}

(window.TFTRenderer = window.TFTRenderer || {}).setupMultiSelect = setupMultiSelect;
