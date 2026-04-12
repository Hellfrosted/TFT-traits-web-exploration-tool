const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createDomElement(tagName) {
    return {
        tagName,
        children: [],
        className: '',
        textContent: '',
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        removeChild(child) {
            this.children = this.children.filter((entry) => entry !== child);
        }
    };
}

function loadResultsSpotlightFactory(sandbox) {
    const sources = [
        'results-spotlight.js',
        'results-view-state.js'
    ].map((fileName) => ({
        fileName,
        source: fs.readFileSync(
            path.join(__dirname, '..', 'renderer', fileName),
            'utf8'
        )
    }));

    sources.forEach(({ fileName, source }) => {
        vm.runInNewContext(source, sandbox, { filename: `renderer/${fileName}` });
    });

    return sandbox.window.TFTRenderer.createResultsSpotlight;
}

describe('renderer results spotlight', () => {
    it('renders an empty spotlight state with the provided message', () => {
        const spotlight = createDomElement('div');
        const sandbox = {
            console,
            window: {
                TFTRenderer: {}
            },
            document: {
                createElement: (tagName) => createDomElement(tagName)
            }
        };
        const createResultsSpotlight = loadResultsSpotlightFactory(sandbox);
        const resultsSpotlight = createResultsSpotlight({
            createTraitChip() {
                return createDomElement('span');
            },
            createUnitPill() {
                return createDomElement('span');
            },
            buildBoardTraitSummary() {
                return [];
            },
            getBoardMetric() {
                return 0;
            },
            getBoardSortLabel() {
                return 'Best Synergy';
            }
        }, {
            hideTraitTooltip() {}
        }, {
            resolveResultsShell: () => ({ boardSpotlight: spotlight }),
            clearNode(node) {
                node.children = [];
            }
        });

        resultsSpotlight.renderEmptySpotlight('Waiting for boards');

        assert.equal(spotlight.className, 'board-spotlight empty');
        assert.equal(spotlight.children.length, 2);
        assert.equal(spotlight.children[1].textContent, 'Waiting for boards');
    });

    it('renders board spotlight details and hides active tooltips first', () => {
        const spotlight = createDomElement('div');
        let hideCalls = 0;
        const sandbox = {
            console,
            window: {
                TFTRenderer: {}
            },
            document: {
                createElement: (tagName) => createDomElement(tagName)
            }
        };
        const createResultsSpotlight = loadResultsSpotlightFactory(sandbox);
        const resultsSpotlight = createResultsSpotlight({
            createTraitChip(trait, className) {
                const chip = createDomElement('span');
                chip.className = className;
                chip.textContent = trait.name;
                return chip;
            },
            createUnitPill(name) {
                const pill = createDomElement('span');
                pill.textContent = name;
                return pill;
            },
            buildBoardTraitSummary() {
                return [{ name: 'Bruiser', isActive: true }];
            },
            getBoardMetric(board) {
                return board.synergyScore;
            },
            getBoardSortLabel() {
                return 'Best Synergy';
            }
        }, {
            hideTraitTooltip() {
                hideCalls += 1;
            }
        }, {
            resolveResultsShell: () => ({ boardSpotlight: spotlight }),
            clearNode(node) {
                node.children = [];
            }
        });

        resultsSpotlight.renderBoardSpotlight({
            units: ['Aatrox', 'Jax'],
            totalCost: 9,
            occupiedSlots: 2,
            synergyScore: 7
        }, 0);

        assert.equal(hideCalls, 1);
        assert.equal(spotlight.className, 'board-spotlight');
        assert.equal(spotlight.children.length, 2);
        assert.equal(spotlight.children[0].className, 'board-spotlight-header');
        assert.equal(spotlight.children[1].className, 'spotlight-inline');
    });
});
