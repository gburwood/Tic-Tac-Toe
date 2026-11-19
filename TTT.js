const boardEl = document.querySelector(".game-board");
const sizeSelect = document.querySelector("#board-size");
const statusEl = document.querySelector("#status");
const matchupEl = document.querySelector("#matchup");
const resetButton = document.querySelector("#reset");
const coin = document.querySelector("#coin");

let size = 3;
let board = [];
let cells = [];
let winLines = [];
let humanMark = "X";
let computerMark = "O";
let currentPlayer = "X";
let gameOver = false;
let turnToken = 0;
let cancelToss = null;
let cancelDrop = null;
let dropping = false;

resetButton.addEventListener("click", startGame);
sizeSelect.addEventListener("change", startGame);
startGame();

function makeWinLines(n) {
    const length = n === 5 ? 4 : 3;
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    const lines = [];
    for (let row = 0; row < n; row++) {
        for (let column = 0; column < n; column++) {
            for (const [dr, dc] of directions) {
                const endRow = row + (length - 1) * dr;
                const endColumn = column + (length - 1) * dc;
                if (endRow < 0 || endRow >= n || endColumn < 0 || endColumn >= n) {
                    continue;
                }
                lines.push(Array.from({ length }, (_, i) => (row + i * dr) * n + column + i * dc));
            }
        }
    }
    return lines;
}

// Return the landing cell for a click, or null when that move is unavailable.
function landingCell(index) {
    if (!Number.isInteger(index) || index < 0 || index >= board.length) return null;
    if (size === 3) return board[index] ? null : index;
    const column = index % size;
    for (let row = size - 1; row >= 0; row--) {
        const candidate = row * size + column;
        if (!board[candidate]) return candidate;
    }
    return null;
}

// One landing cell per column on gravity boards, every empty cell on 3×3.
function legalMoves() {
    if (size === 3) {
        return board.flatMap((mark, index) => mark ? [] : [index]);
    }
    return Array.from({ length: size }, (_, column) => landingCell(column))
        .filter((index) => index !== null);
}

function updateCellLabel(index) {
    const cell = cells[index];
    const content = board[index] || "empty";
    if (size === 3) {
        cell.setAttribute("aria-label", `${cell.dataset.label}, ${content}`);
        return;
    }
    const landing = landingCell(index);
    const action = landing === null
        ? "column full"
        : `drop in column ${index % size + 1}, lands in row ${Math.floor(landing / size) + 1}`;
    cell.setAttribute("aria-label", `${cell.dataset.label}, ${content}; ${action}`);
}

function buildBoard() {
    boardEl.replaceChildren();
    boardEl.style.setProperty("--board-size", size);
    boardEl.setAttribute("aria-label", `${size} by ${size} tic-tac-toe board`);
    cells = board.map((_, index) => {
        const cell = document.createElement("button");
        const row = Math.floor(index / size) + 1;
        const column = index % size + 1;
        cell.type = "button";
        cell.className = "cell";
        cell.dataset.label = `Row ${row}, column ${column}`;
        cell.disabled = true;
        cell.addEventListener("click", () => playHumanMove(index));
        boardEl.appendChild(cell);
        return cell;
    });
    cells.forEach((_, index) => updateCellLabel(index));
}

function startGame() {
    const token = ++turnToken;
    if (cancelToss) cancelToss();
    if (cancelDrop) cancelDrop();
    const selectedSize = Number(sizeSelect.value);
    size = [3, 4, 5].includes(selectedSize) ? selectedSize : 3;
    board = Array(size * size).fill(null);
    winLines = makeWinLines(size);
    gameOver = false;
    buildBoard();
    matchupEl.textContent = "";
    statusEl.textContent = "Tossing a coin…";

    const side = Math.random() < 0.5 ? "heads" : "tails";
    playToss(side).then(() => {
        if (token !== turnToken) return;
        humanMark = side === "heads" ? "X" : "O";
        computerMark = humanMark === "X" ? "O" : "X";
        currentPlayer = "X";
        matchupEl.textContent = side === "heads"
            ? "Heads. You start as X."
            : "Tails. Computer starts as X.";

        if (currentPlayer === humanMark) {
            statusEl.textContent = "Your turn";
            unlockEmptyCells();
        } else {
            statusEl.textContent = "Computer's turn";
            window.setTimeout(() => computerTurn(token), 450);
        }
    });
}

function playToss(side) {
    coin.classList.remove("land-heads", "land-tails", "show-heads", "show-tails");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        coin.classList.add(`show-${side}`);
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        let timer;
        const finish = () => {
            window.clearTimeout(timer);
            coin.removeEventListener("animationend", onEnd);
            cancelToss = null;
            resolve();
        };
        const onEnd = (event) => {
            if (event.target === coin) finish();
        };
        cancelToss = finish;
        coin.addEventListener("animationend", onEnd);
        void coin.offsetWidth;
        coin.classList.add(`land-${side}`);
        timer = window.setTimeout(() => {
            coin.classList.remove("land-heads", "land-tails");
            coin.classList.add(`show-${side}`);
            finish();
        }, 1500);
    });
}

function playHumanMove(index) {
    if (gameOver || dropping || currentPlayer !== humanMark) return;
    const landing = landingCell(index);
    if (landing === null) return;
    const token = turnToken;
    makeMove(landing, humanMark, token, () => {
        currentPlayer = computerMark;
        statusEl.textContent = "Computer's turn";
        lockBoard();
        window.setTimeout(() => computerTurn(token), 450);
    });
}

function computerTurn(token) {
    if (token !== turnToken || gameOver || dropping || currentPlayer !== computerMark) return;
    const index = chooseComputerMove();
    if (index === undefined) return;
    makeMove(index, computerMark, token, () => {
        currentPlayer = humanMark;
        statusEl.textContent = "Your turn";
        unlockEmptyCells();
    });
}

// Keep the real board unchanged until the visual mark settles.
function makeMove(index, mark, token, afterLanding) {
    if (size === 3 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        if (placeMark(index, mark)) afterLanding();
        return;
    }
    dropping = true;
    lockBoard();
    statusEl.textContent = mark === humanMark ? "Your mark is falling…" : "Computer's mark is falling…";

    // Anchor the overlay to the target grid cell so resizing keeps it aligned.
    const visual = document.createElement("span");
    visual.className = `falling-mark ${mark.toLowerCase()}`;
    visual.setAttribute("aria-hidden", "true");
    visual.textContent = mark;
    visual.style.gridColumn = String(index % size + 1);
    visual.style.gridRow = String(Math.floor(index / size) + 1);
    const targetRect = cells[index].getBoundingClientRect();
    const topRect = cells[index % size].getBoundingClientRect();
    visual.style.setProperty("--drop-distance", `${targetRect.top - topRect.top + topRect.height}px`);
    boardEl.appendChild(visual);

    let finished = false;
    let timer;
    const cleanup = () => {
        if (finished) return false;
        finished = true;
        window.clearTimeout(timer);
        visual.removeEventListener("animationend", onAnimation);
        visual.removeEventListener("animationcancel", onAnimation);
        visual.remove();
        cancelDrop = null;
        dropping = false;
        return true;
    };
    const finish = () => {
        if (!cleanup() || token !== turnToken) return;
        if (placeMark(index, mark)) afterLanding();
    };
    const onAnimation = (event) => {
        if (event.target === visual && event.animationName === "drop-mark") finish();
    };
    cancelDrop = cleanup;
    visual.addEventListener("animationend", onAnimation);
    visual.addEventListener("animationcancel", onAnimation);
    // Recover when animations or animation events are unavailable.
    timer = window.setTimeout(finish, 800);
}

function placeMark(index, mark) {
    board[index] = mark;
    const cell = cells[index];
    cell.textContent = mark;
    cell.classList.add(mark.toLowerCase());
    cells.forEach((_, i) => updateCellLabel(i));

    const line = findWinningLine(mark);
    if (line) {
        gameOver = true;
        line.forEach((i) => cells[i].classList.add("win"));
        statusEl.textContent = mark === humanMark ? "You win" : "Computer wins";
        lockBoard();
        return false;
    }
    if (board.every(Boolean)) {
        gameOver = true;
        statusEl.textContent = "Draw";
        lockBoard();
        return false;
    }
    return true;
}

function chooseComputerMove() {
    let bestScore = -Infinity;
    const choices = [];
    for (const index of legalMoves()) {
        board[index] = computerMark;
        const score = minimax(humanMark, 1, -Infinity, Infinity);
        board[index] = null;
        if (score > bestScore) {
            bestScore = score;
            choices.length = 0;
            choices.push(index);
        } else if (score === bestScore) {
            choices.push(index);
        }
    }
    return choices[Math.floor(Math.random() * choices.length)];
}

function minimax(player, depth, alpha, beta) {
    if (findWinningLine(computerMark)) return 10000 - depth;
    if (findWinningLine(humanMark)) return depth - 10000;
    if (board.every(Boolean)) return 0;
    // Search all of 3×3; cap larger boards to keep turns responsive.
    if ((size === 4 && depth >= 4) || (size === 5 && depth >= 3)) {
        return evaluateBoard();
    }

    const maximizing = player === computerMark;
    let best = maximizing ? -Infinity : Infinity;
    for (const index of legalMoves()) {
        board[index] = player;
        const score = minimax(opponent(player), depth + 1, alpha, beta);
        board[index] = null;
        if (maximizing) {
            best = Math.max(best, score);
            alpha = Math.max(alpha, best);
        } else {
            best = Math.min(best, score);
            beta = Math.min(beta, best);
        }
        if (beta <= alpha) break;
    }
    return best;
}

function evaluateBoard() {
    const weights = [0, 1, 6, 30, 150, 0];
    return winLines.reduce((score, line) => {
        let computer = 0;
        let human = 0;
        line.forEach((index) => {
            if (board[index] === computerMark) computer++;
            if (board[index] === humanMark) human++;
        });
        if (computer && human) return score;
        return score + weights[computer] - weights[human];
    }, 0);
}

function findWinningLine(player) {
    return winLines.find((line) => line.every((index) => board[index] === player)) ?? null;
}

function opponent(mark) {
    return mark === "X" ? "O" : "X";
}

function lockBoard() {
    cells.forEach((cell) => {
        cell.disabled = true;
    });
}

function unlockEmptyCells() {
    cells.forEach((cell, index) => {
        cell.disabled = landingCell(index) === null;
    });
}
