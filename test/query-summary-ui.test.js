const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadQuerySummaryUiFactory(sandbox) {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'renderer', 'query-summary-ui.js'),
        'utf8'
    );

    vm.runInNewContext(source, sandbox, { filename: 'renderer/query-summary-ui.js' });
    return sandbox.window.TFTRenderer.createQuerySummaryUi;
}

describe('renderer query summary ui', () => {
    it('builds summary markup with chips and active meta classes', () => {
        const sandbox = {
            console,
            window: {
                TFTRenderer: {
                    shared: {
                        escapeHtml: (value) => String(value ?? '')
                    }
                }
            }
        };
        const createQuerySummaryUi = loadQuerySummaryUiFactory(sandbox);
        const querySummaryUi = createQuerySummaryUi();
        const chips = querySummaryUi.buildQuerySummaryChips({
            boardSize: 9,
            maxResults: 50,
            mustInclude: ['A'],
            mustExclude: [],
            mustIncludeTraits: ['Bruiser'],
            mustExcludeTraits: [],
            extraEmblems: [],
            variantLocks: { MissFortune: 'conduit' },
            includeUnique: true,
            onlyActive: false,
            tierRank: false
        });
        const markup = querySummaryUi.buildQuerySummaryMarkup({
            chips,
            meta: 'Loaded Set 17',
            metaClass: querySummaryUi.getQuerySummaryMetaClass('Loaded Set 17')
        });

        assert.match(markup, /query-summary-meta query-summary-meta-active/);
        assert.match(markup, /Include 1 units/);
        assert.match(markup, /Force 1 traits/);
        assert.match(markup, /1 locked modes/);
        assert.match(markup, /Inactive traits counted/);
    });

    it('summarizes asset coverage and draft constraint counts', () => {
        const sandbox = {
            console,
            window: {
                TFTRenderer: {
                    shared: {
                        escapeHtml: (value) => String(value ?? '')
                    }
                }
            }
        };
        const createQuerySummaryUi = loadQuerySummaryUiFactory(sandbox);
        const querySummaryUi = createQuerySummaryUi();

        assert.equal(querySummaryUi.getAssetCoverageLabel({
            championAssetCount: 10,
            matchedChampionCount: 8,
            totalUnits: 9
        }), '8/9');
        assert.equal(querySummaryUi.summarizeAssetValidation({
            championAssetCount: 10,
            matchedChampionCount: 8,
            totalUnits: 9,
            missingChampionIcons: ['A', 'B', 'C', 'D']
        }), '8/9 champion splashes matched, 4 missing (A, B, C, ...)');
        assert.equal(querySummaryUi.countDraftQuerySignals({
            mustInclude: ['A'],
            mustExclude: ['B'],
            mustIncludeTraits: [],
            mustExcludeTraits: [],
            extraEmblems: ['Emblem'],
            variantLocks: { MissFortune: 'conduit' }
        }), 4);
        assert.equal(querySummaryUi.getDraftQueryMeta({
            mustInclude: [],
            mustExclude: [],
            mustIncludeTraits: [],
            mustExcludeTraits: [],
            extraEmblems: [],
            variantLocks: {}
        }), 'Idle');
    });
});
