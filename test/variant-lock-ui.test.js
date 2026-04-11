const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createClassList(initial = []) {
    const values = new Set(initial);
    return {
        add: (value) => values.add(value),
        remove: (value) => values.delete(value),
        contains: (value) => values.has(value)
    };
}

function createDomElement(tagName) {
    const listeners = new Map();
    const element = {
        tagName,
        children: [],
        className: '',
        classList: createClassList(),
        attributes: {},
        textContent: '',
        value: '',
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        setAttribute(name, value) {
            this.attributes[name] = value;
        },
        addEventListener(eventName, handler) {
            if (!listeners.has(eventName)) {
                listeners.set(eventName, []);
            }
            listeners.get(eventName).push(handler);
        }
    };

    Object.defineProperty(element, 'options', {
        get() {
            return this.children;
        }
    });

    let innerHtmlValue = '';
    Object.defineProperty(element, 'innerHTML', {
        get() {
            return innerHtmlValue;
        },
        set(value) {
            innerHtmlValue = value;
            this.children = [];
        }
    });

    return element;
}

function loadVariantLockUiFactory(sandbox) {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'variant-lock-ui.js'),
        'utf8'
    );

    vm.runInNewContext(source, sandbox, { filename: 'renderer/variant-lock-ui.js' });
    return sandbox.window.TFTRenderer.createVariantLockUi;
}

describe('renderer variant lock ui', () => {
    it('preserves requested locks for variant-capable units and filters out auto values from the current lock map', () => {
        const section = createDomElement('section');
        section.classList.add('hidden');
        const container = createDomElement('div');
        const sandbox = {
            console,
            window: {
                TFTRenderer: {}
            },
            document: {
                createElement: (tagName) => createDomElement(tagName)
            }
        };

        const createVariantLockUi = loadVariantLockUiFactory(sandbox);
        const app = {
            state: {
                activeData: {
                    unitMap: new Map([
                        ['MissFortune', {
                            id: 'MissFortune',
                            displayName: 'Miss Fortune',
                            variants: [
                                { id: 'conduit', label: 'Conduit Mode' },
                                { id: 'challenger', label: 'Challenger Mode' }
                            ]
                        }],
                        ['Braum', {
                            id: 'Braum',
                            displayName: 'Braum',
                            variants: []
                        }]
                    ])
                },
                variantLockControls: new Map()
            }
        };

        const variantLockUi = createVariantLockUi(app, {
            resolveSummaryShell: () => ({
                variantLocksSection: section,
                variantLocksContainer: container
            }),
            refreshDraftQuerySummary: () => {}
        });

        variantLockUi.renderVariantLockControls({ MissFortune: 'challenger' });

        assert.equal(section.classList.contains('hidden'), false);
        assert.equal(container.children.length, 1);
        assert.equal(app.state.variantLockControls.get('MissFortune').value, 'challenger');
        assert.deepEqual(
            app.state.variantLockControls.get('MissFortune').options.map((option) => option.value),
            ['auto', 'conduit', 'challenger']
        );
        assert.deepEqual(
            JSON.parse(JSON.stringify(variantLockUi.getCurrentVariantLocks())),
            { MissFortune: 'challenger' }
        );

        app.state.variantLockControls.get('MissFortune').value = 'auto';
        assert.deepEqual(
            JSON.parse(JSON.stringify(variantLockUi.getCurrentVariantLocks())),
            {}
        );
    });
});
