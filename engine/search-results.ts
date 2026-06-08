function createWorstBoardHeap(topBoards) {
    const heapSlots = [];
    const heapPositionBySlot = [];

    function compareSlots(leftSlot, rightSlot) {
        return topBoards[leftSlot]._score - topBoards[rightSlot]._score || leftSlot - rightSlot;
    }

    function swap(leftPosition, rightPosition) {
        const leftSlot = heapSlots[leftPosition];
        const rightSlot = heapSlots[rightPosition];
        heapSlots[leftPosition] = rightSlot;
        heapSlots[rightPosition] = leftSlot;
        heapPositionBySlot[leftSlot] = rightPosition;
        heapPositionBySlot[rightSlot] = leftPosition;
    }

    function siftUp(startPosition) {
        let position = startPosition;
        while (position > 0) {
            const parentPosition = Math.floor((position - 1) / 2);
            if (compareSlots(heapSlots[parentPosition], heapSlots[position]) <= 0) {
                return;
            }
            swap(parentPosition, position);
            position = parentPosition;
        }
    }

    function siftDown(startPosition) {
        let position = startPosition;
        while (true) {
            const leftChildPosition = position * 2 + 1;
            const rightChildPosition = leftChildPosition + 1;
            let bestPosition = position;

            if (
                leftChildPosition < heapSlots.length &&
                compareSlots(heapSlots[leftChildPosition], heapSlots[bestPosition]) < 0
            ) {
                bestPosition = leftChildPosition;
            }
            if (
                rightChildPosition < heapSlots.length &&
                compareSlots(heapSlots[rightChildPosition], heapSlots[bestPosition]) < 0
            ) {
                bestPosition = rightChildPosition;
            }
            if (bestPosition === position) {
                return;
            }

            swap(position, bestPosition);
            position = bestPosition;
        }
    }

    return {
        push(slot) {
            heapPositionBySlot[slot] = heapSlots.length;
            heapSlots.push(slot);
            siftUp(heapSlots.length - 1);
        },
        worstSlot() {
            return heapSlots[0];
        },
        update(slot) {
            const position = heapPositionBySlot[slot];
            siftDown(position);
            siftUp(heapPositionBySlot[slot]);
        }
    };
}

function createTopBoardTracker({
    maxBoards,
    createBoardResult
}) {
    const topBoards = [];
    const worstBoardHeap = createWorstBoardHeap(topBoards);

    function canAcceptScore(totalScore) {
        const worstSlot = worstBoardHeap.worstSlot();
        return topBoards.length < maxBoards || totalScore > topBoards[worstSlot]._score;
    }

    function addBoard({ unitIds, evaluation, totalCost }) {
        const board = createBoardResult({ unitIds, evaluation, totalCost });
        const totalScore = board._score;

        if (topBoards.length < maxBoards) {
            topBoards.push(board);
            worstBoardHeap.push(topBoards.length - 1);
            return board;
        }

        const worstSlot = worstBoardHeap.worstSlot();
        if (totalScore > topBoards[worstSlot]._score) {
            topBoards[worstSlot] = board;
            worstBoardHeap.update(worstSlot);
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
