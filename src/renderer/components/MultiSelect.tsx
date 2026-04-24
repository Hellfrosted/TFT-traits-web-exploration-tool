import { useMemo, useState } from 'react';

type MultiSelectOption = string | {
    value?: string;
    id?: string;
    name?: string;
    label?: string;
    displayName?: string;
    pillLabel?: string;
    dropdownMeta?: string;
    iconUrl?: string;
};

type MultiSelectProps = {
    id: string;
    label: string;
    options: MultiSelectOption[];
    value: string[];
    onChange: (value: string[]) => void;
    placeholder?: string;
};

function getOptionValue(option: MultiSelectOption) {
    if (typeof option === 'string') return option;
    return option?.value ?? option?.id ?? option?.name ?? option?.label ?? '';
}

function getOptionLabel(option: MultiSelectOption) {
    if (typeof option === 'string') return option;
    return option?.label ?? option?.displayName ?? option?.name ?? option?.id ?? option?.value ?? '';
}

function getOptionPillLabel(option: MultiSelectOption) {
    if (typeof option === 'string') return option;
    return option?.pillLabel ?? getOptionLabel(option);
}

export function MultiSelect({ id, label, options, value, onChange, placeholder }: MultiSelectProps) {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const optionMap = useMemo(() => {
        const map = new Map();
        options.forEach((option) => {
            const optionValue = getOptionValue(option);
            if (!optionValue) return;
            map.set(optionValue, {
                value: optionValue,
                label: getOptionLabel(option),
                pillLabel: getOptionPillLabel(option),
                meta: typeof option === 'string' ? '' : option.dropdownMeta || '',
                iconUrl: typeof option === 'string' ? '' : option.iconUrl || ''
            });
        });
        return map;
    }, [options]);
    const selected = Array.isArray(value) ? value : [];
    const selectedSet = useMemo(() => new Set(selected), [selected]);
    const filteredOptions = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return [...optionMap.values()]
            .filter((option) => {
                if (selectedSet.has(option.value)) return false;
                if (!normalizedQuery) return true;
                return `${option.value} ${option.label} ${option.meta}`.toLowerCase().includes(normalizedQuery);
            })
            .slice(0, 50);
    }, [optionMap, query, selectedSet]);

    function addValue(nextValue: string) {
        if (!nextValue || selectedSet.has(nextValue)) return;
        onChange([...selected, nextValue]);
        setQuery('');
        setIsOpen(false);
    }

    function removeValue(nextValue: string) {
        onChange(selected.filter((entry) => entry !== nextValue));
    }

    return (
        <div className="field-group">
            <label htmlFor={`${id}Input`}>{label}</label>
            <div id={`${id}Container`} className="multi-select-container">
                <div className="pills" aria-label={`${label} selections`}>
                    {selected.map((entry) => {
                        const option = optionMap.get(entry);
                        const labelText = option?.pillLabel || option?.label || entry;
                        return (
                            <div className="pill" key={entry}>
                                {option?.iconUrl ? <img className="pill-icon option-icon" src={option.iconUrl} alt={labelText} loading="lazy" /> : null}
                                <span className="pill-label">
                                    <span className="pill-label-text">{labelText}</span>
                                </span>
                                <button type="button" className="remove" aria-label={`Remove ${labelText}`} onClick={() => removeValue(entry)}>x</button>
                            </div>
                        );
                    })}
                </div>
                <input
                    id={`${id}Input`}
                    type="text"
                    value={query}
                    placeholder={placeholder}
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={isOpen}
                    onFocus={() => setIsOpen(true)}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setIsOpen(true);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && filteredOptions[0]) {
                            event.preventDefault();
                            addValue(filteredOptions[0].value);
                        }
                        if (event.key === 'Backspace' && !query && selected.length > 0) {
                            removeValue(selected.at(-1));
                        }
                        if (event.key === 'Escape') {
                            setIsOpen(false);
                        }
                    }}
                />
                <div className={`dropdown${isOpen && (filteredOptions.length > 0 || query.trim()) ? '' : ' hidden'}`} role="listbox">
                    {filteredOptions.length > 0 ? filteredOptions.map((option) => (
                        <button
                            type="button"
                            className="dropdown-item"
                            key={option.value}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => addValue(option.value)}
                        >
                            {option.iconUrl ? <img className="pill-icon option-icon" src={option.iconUrl} alt={option.label} loading="lazy" /> : null}
                            <span className="dropdown-item-content">
                                <span className="dropdown-item-label">{option.label}</span>
                                {option.meta ? <span className="dropdown-item-meta">{option.meta}</span> : null}
                            </span>
                        </button>
                    )) : <div className="dropdown-empty">No matching options</div>}
                </div>
            </div>
        </div>
    );
}
