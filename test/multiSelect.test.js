const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createClassList(initial = []) {
    const classes = new Set(initial);
    return {
        add: (...tokens) => tokens.forEach((token) => classes.add(token)),
        remove: (...tokens) => tokens.forEach((token) => classes.delete(token)),
        contains: (token) => classes.has(token),
        toArray: () => [...classes]
    };
}

function createEventTarget() {
    const listeners = new Map();
    return {
        addEventListener(eventName, handler) {
            if (!listeners.has(eventName)) {
                listeners.set(eventName, []);
            }
            listeners.get(eventName).push(handler);
        },
        dispatchEvent(event) {
            const handlers = listeners.get(event.type) || [];
            handlers.forEach((handler) => handler(event));
        }
    };
}

function createElement(tagName = 'div') {
    const eventTarget = createEventTarget();
    const element = {
        tagName: tagName.toUpperCase(),
        children: [],
        dataset: {},
        style: {},
        className: '',
        classList: createClassList(),
        value: '',
        innerHTML: '',
        textContent: '',
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        remove() {
            this.removed = true;
        },
        contains(target) {
            return target === this || this.children.includes(target);
        },
        querySelectorAll(selector) {
            if (selector === '.pill') {
                return this.children.filter((child) => child.className === 'pill');
            }
            return [];
        },
        ...eventTarget
    };

    return element;
}

function loadMultiSelect(sandbox) {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'components', 'multiSelect.js'),
        'utf8'
    );

    vm.runInNewContext(source, sandbox, { filename: 'components/multiSelect.js' });
    return sandbox.window.TFTRenderer?.components?.setupMultiSelect;
}

describe('multiSelect component', () => {
    it('keeps the dropdown hidden after programmatic setValues during bootstrap', () => {
        const pills = createElement('div');
        const input = createElement('input');
        const dropdown = createElement('div');
        dropdown.classList.add('hidden');
        const container = createElement('div');
        container.querySelector = (selector) => ({
            '.pills': pills,
            'input': input,
            '.dropdown': dropdown
        }[selector] || null);

        const documentListeners = createEventTarget();
        const sandbox = {
            console,
            AbortController: class AbortController {
                constructor() {
                    this.signal = {};
                }

                abort() {}
            },
            CustomEvent: function CustomEvent(type, init) {
                this.type = type;
                this.detail = init?.detail;
                this.bubbles = init?.bubbles;
            },
            document: {
                activeElement: null,
                getElementById: (id) => id === 'mustIncludeContainer' ? container : null,
                createElement: (tagName) => createElement(tagName),
                createTextNode: (text) => ({ textContent: text }),
                addEventListener: documentListeners.addEventListener
            },
            window: {}
        };

        const setupMultiSelect = loadMultiSelect(sandbox);
        const controller = setupMultiSelect('mustIncludeContainer', [
            { id: 'Galio', displayName: 'Galio' },
            { id: 'LeBlanc', displayName: 'LeBlanc' }
        ], true);

        dropdown.classList.remove('hidden');
        controller.setValues([]);

        assert.equal(dropdown.classList.contains('hidden'), true);
    });

    it('does not emit value-change events when typing in the filter input', () => {
        const pills = createElement('div');
        const input = createElement('input');
        const dropdown = createElement('div');
        dropdown.classList.add('hidden');
        const container = createElement('div');
        container.querySelector = (selector) => ({
            '.pills': pills,
            'input': input,
            '.dropdown': dropdown
        }[selector] || null);

        let changeEvents = 0;
        const originalDispatchEvent = container.dispatchEvent;
        container.dispatchEvent = (event) => {
            if (event?.type === 'multiselectchange') {
                changeEvents += 1;
            }
            return originalDispatchEvent.call(container, event);
        };

        const documentListeners = createEventTarget();
        const sandbox = {
            console,
            AbortController: class AbortController {
                constructor() {
                    this.signal = {};
                }

                abort() {}
            },
            CustomEvent: function CustomEvent(type, init) {
                this.type = type;
                this.detail = init?.detail;
                this.bubbles = init?.bubbles;
            },
            document: {
                activeElement: input,
                getElementById: (id) => id === 'mustIncludeContainer' ? container : null,
                createElement: (tagName) => createElement(tagName),
                createTextNode: (text) => ({ textContent: text }),
                addEventListener: documentListeners.addEventListener
            },
            window: {}
        };

        const setupMultiSelect = loadMultiSelect(sandbox);
        setupMultiSelect('mustIncludeContainer', [
            { id: 'Galio', displayName: 'Galio' },
            { id: 'LeBlanc', displayName: 'LeBlanc' }
        ], true);

        input.value = 'ga';
        input.dispatchEvent({ type: 'input' });

        assert.equal(changeEvents, 0);
    });
});
