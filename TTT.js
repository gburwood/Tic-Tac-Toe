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

resetButton.addEventListener("click", startGame);
sizeSelect.addEventListener("change", startGame);
startGame();

function makeWinLines(n) {
    const lines = [];
    for (let i = 0; i < n; i++) {
        lines.push(Array.from({ length: n }, (_, j) => i * n + j));
        lines.push(Array.from({ length: n }, (_, j) => j * n + i));
    }
    lines.push(Array.from({ length: n }, (_, i) => i * n + i));
    lines.push(Array.from({ length: n }, (_, i) => i * n + (n - 1 - i)));
    return lines;
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
        cell.setAttribute("aria-label", `${cell.dataset.label}, empty`);
        cell.disabled = true;
        cell.addEventListener("click", () => playHumanMove(index));
        boardEl.appendChild(cell);
        return cell;
    });
}

function startGame() {
    const token = ++turnToken;
    if (cancelToss) {
        cancelToss();
    }
    size = Number(sizeSelect.value) === 4 ? 4 : 3;
    board = Array(size * size).fill(null);
    winLines = makeWinLines(size);
    gameOver = false;
    buildBoard();
    matchupEl.textContent = "";
    statusEl.textContent = "Tossing a coin…";

    const side = Math.random() < 0.5 ? "heads" : "tails";
    playToss(side).then(() => {
        if (token !== turnToken) {
            return;
        }
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
            if (event.target === coin) {
                finish();
            }
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
    if (gameOver || currentPlayer !== humanMark || board[index]) {
        return;
    }
    const token = turnToken;
    if (!placeMark(index, humanMark)) {
        return;
    }
    currentPlayer = computerMark;
    statusEl.textContent = "Computer's turn";
    lockBoard();
    window.setTimeout(() => computerTurn(token), 450);
}

function computerTurn(token) {
    if (token !== turnToken || gameOver || currentPlayer !== computerMark) {
        return;
    }
    const index = chooseComputerMove();
    if (!placeMark(index, computerMark)) {
        return;
    }
    currentPlayer = humanMark;
    statusEl.textContent = "Your turn";
    unlockEmptyCells();
}

function placeMark(index, mark) {
    board[index] = mark;
    const cell = cells[index];
    cell.textContent = mark;
    cell.classList.add(mark.toLowerCase());
    cell.disabled = true;
    cell.setAttribute("aria-label", `${cell.dataset.label}, ${mark}`);

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
    for (let index = 0; index < board.length; index++) {
        if (board[index]) {
            continue;
        }
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
    if (findWinningLine(computerMark)) {
        return 10000 - depth;
    }
    if (findWinningLine(humanMark)) {
        return depth - 10000;
    }
    if (board.every(Boolean)) {
        return 0;
    }
    // Search the entire 3×3 game tree; limit 4×4 to keep turns responsive.
    if (size === 4 && depth >= 4) {
        return evaluateBoard();
    }

    const maximizing = player === computerMark;
    let best = maximizing ? -Infinity : Infinity;
    for (let index = 0; index < board.length; index++) {
        if (board[index]) {
            continue;
        }
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
        if (beta <= alpha) {
            break;
        }
    }
    return best;
}

function evaluateBoard() {
    const weights = [0, 1, 6, 30, 0];
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
        cell.disabled = Boolean(board[index]);
    });
}
