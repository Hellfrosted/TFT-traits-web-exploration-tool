function createTopBoardTracker({
    maxBoards,
    findWorstBoardIndex,
    createBoardResult
}) {
    const topBoards = [];
    let worstScore = -Infinity;
    let worstIndex = -1;

    function canAcceptScore(totalScore) {
        return topBoards.length < maxBoards || totalScore > worstScore;
    }

    function addBoard({ unitIds, evaluation, totalCost }) {
        const board = createBoardResult({ unitIds, evaluation, totalCost });
        const totalScore = board._score;

        if (topBoards.length < maxBoards) {
            topBoards.push(board);
            if (topBoards.length === maxBoards) {
                worstIndex = findWorstBoardIndex(topBoards);
                worstScore = topBoards[worstIndex]._score;
            }
            return board;
        }

        if (totalScore > worstScore) {
            topBoards[worstIndex] = board;
            worstIndex = findWorstBoardIndex(topBoards);
            worstScore = topBoards[worstIndex]._score;
            return board;
        }

        return null;
    }

    return {
        topBoards,
        canAcceptScore,
        addBoard
    };
}

function finalizeTopBoards(topBoards = []) {
    for (const board of topBoards) {
        delete board._score;
    }

    topBoards.sort((left, right) =>
        right.synergyScore - left.synergyScore ||
        right.totalCost - left.totalCost ||
        left.units.join(',').localeCompare(right.units.join(','))
    );

    return topBoards;
}

module.exports = {
    createTopBoardTracker,
    finalizeTopBoards
};
