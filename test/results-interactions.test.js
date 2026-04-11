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
    return {
        tagName,
        children: [],
        className: '',
        classList: createClassList(),
        attributes: {},
        textContent: '',
        disabled: false,
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        removeChild(child) {
            this.children = this.children.filter((entry) => entry !== child);
        },
        setAttribute(name, value) {
            this.attributes[name] = value;
        },
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

function loadResultsInteractionsFactory(sandbox) {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'results-interactions.js'),
        'utf8'
    );

    vm.runInNewContext(source, sandbox, { filename: 'renderer/results-interactions.js' });
    return sandbox.window.TFTRenderer.createResultsInteractions;
}

describe('renderer results interactions', () => {
    it('renders pager controls that move between pages', () => {
        const pager = createDomElement('div');
        const renderCalls = [];
        const sandbox = {
            console,
            window: {
                TFTRenderer: {}
            },
            document: {
                createElement: (tagName) => createDomElement(tagName)
            }
        };
        const createResultsInteractions = loadResultsInteractionsFactory(sandbox);
        const resultsInteractions = createResultsInteractions({
            state: {
                searchLimits: {
                    RESULTS_PAGE_SIZE: 25
                }
            }
        }, {
            resolveResultsShell: () => ({
                resultsPager: pager
            }),
            clearNode(node) {
                node.children = [];
            },
            renderResults(results, options) {
                renderCalls.push({ results, options });
            },
            renderBoardSpotlight() {}
        });

        const results = Array.from({ length: 120 }, (_value, index) => ({ id: index + 1 }));
        resultsInteractions.renderResultsPager(results, {
            page: 1,
            totalPages: 5,
            startIndex: 25,
            endIndex: 50
        });

        assert.equal(pager.children.length, 2);
        const controls = pager.children[1];
        controls.children[0].dispatchEvent({ type: 'click' });
        controls.children[2].dispatchEvent({ type: 'click' });

        assert.deepEqual(JSON.parse(JSON.stringify(renderCalls)), [
            { results, options: { page: 0 } },
            { results, options: { page: 2 } }
        ]);
    });

    it('updates the selected row and spotlight when a row is chosen by mouse or keyboard', () => {
        const spotlightCalls = [];
        const sandbox = {
            console,
            window: {
                TFTRenderer: {}
            }
        };
        const createResultsInteractions = loadResultsInteractionsFactory(sandbox);
        const resultsInteractions = createResultsInteractions({
            state: {
                selectedBoardIndex: -1
            }
        }, {
            resolveResultsShell: () => ({}),
            clearNode() {},
            renderResults() {},
            renderBoardSpotlight(board, index) {
                spotlightCalls.push({ board, index });
            }
        });
        const rowA = createDomElement('tr');
        const rowB = createDomElement('tr');
        const selectedRowRef = { current: null };
        const results = [{ id: 'A' }, { id: 'B' }];

        resultsInteractions.bindRowSelection(rowA, results, 0, selectedRowRef);
        resultsInteractions.bindRowSelection(rowB, results, 1, selectedRowRef);

        rowA.dispatchEvent({ type: 'click' });
        rowB.dispatchEvent({
            type: 'keydown',
            key: 'Enter',
            preventDefault() {}
        });

        assert.equal(selectedRowRef.current, rowB);
        assert.equal(rowA.classList.contains('result-row-selected'), false);
        assert.equal(rowB.classList.contains('result-row-selected'), true);
        assert.deepEqual(JSON.parse(JSON.stringify(spotlightCalls)), [
            { board: { id: 'A' }, index: 0 },
            { board: { id: 'B' }, index: 1 }
        ]);
    });
});
