const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'TTT.js'), 'utf8');

class Element {
    constructor() {
        this.children = [];
        this.attributes = {};
        this.dataset = {};
        this.listeners = {};
        this.disabled = false;
        this.textContent = '';
        this.value = '';
        this.styles = {};
        this.style = { setProperty: (key, value) => { this.styles[key] = value; } };
        const classes = new Set();
        this.classList = {
            add: (...names) => names.forEach((name) => classes.add(name)),
            remove: (...names) => names.forEach((name) => classes.delete(name)),
            contains: (name) => classes.has(name)
        };
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, handler) { (this.listeners[name] ??= []).push(handler); }
    removeEventListener(name, handler) {
        this.listeners[name] = (this.listeners[name] || []).filter((item) => item !== handler);
    }
    dispatch(name) { for (const handler of this.listeners[name] || []) handler({ target: this }); }
    appendChild(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
}

function setup(random = 0) {
    const elements = Object.fromEntries(['.game-board', '#board-size', '#status', '#matchup', '#reset', '#coin'].map((key) => [key, new Element()]));
    elements['#board-size'].value = '3';
    const timers = new Map();
    let nextTimer = 0;
    const math = Object.create(Math);
    math.random = () => random;
    const context = vm.createContext({
        document: {
            querySelector: (selector) => elements[selector],
            createElement: () => new Element()
        },
        window: {
            matchMedia: () => ({ matches: true }),
            setTimeout: (fn) => { const id = ++nextTimer; timers.set(id, fn); return id; },
            clearTimeout: (id) => timers.delete(id)
        },
        Math: math
    });
    vm.runInContext(source, context);
    return {
        elements,
        run: (code) => vm.runInContext(code, context),
        runTimers: () => {
            const pending = [...timers.values()];
            timers.clear();
            pending.forEach((fn) => fn());
        }
    };
}

async function settle() { await Promise.resolve(); }

test('selector exposes all supported sizes and defaults to 3', () => {
    const html = fs.readFileSync(path.join(root, 'TTT.html'), 'utf8');
    assert.match(html, /<option\s+value="3"\s+selected>/);
    assert.match(html, /<option\s+value="4">/);
    assert.match(html, /<option\s+value="5">/);
});

test('selection, reset, labels and stale computer turns work across sizes', async () => {
    const game = setup();
    await settle();
    const select = game.elements['#board-size'];
    const board = game.elements['.game-board'];
    assert.equal(board.children.length, 9);
    select.value = '5';
    select.dispatch('change');
    assert.equal(board.children.length, 25);
    assert.equal(board.styles['--board-size'], 5);
    assert.equal(board.attributes['aria-label'], '5 by 5 tic-tac-toe board');
    assert.equal(board.children[24].attributes['aria-label'], 'Row 5, column 5, empty; drop in column 5, lands in row 5');
    await settle();
    assert.equal(game.elements['#status'].textContent, 'Your turn');
    board.children[0].dispatch('click');
    assert.equal(board.children[20].attributes['aria-label'], 'Row 5, column 1, X; drop in column 1, lands in row 4');
    assert.ok(board.children.every((cell) => cell.disabled));
    game.elements['#reset'].dispatch('click');
    assert.equal(board.children.length, 25);
    assert.equal(select.value, '5');
    await settle();
    game.runTimers();
    assert.ok(board.children.every((cell) => cell.textContent === ''));
    assert.ok(board.children.every((cell) => !cell.disabled));
    select.value = '4';
    select.dispatch('change');
    await settle();
    assert.equal(board.children.length, 16);
    select.value = '3';
    select.dispatch('change');
    await settle();
    assert.equal(board.children.length, 9);
});

test('stale toss completions cannot alter a newly selected game', async () => {
    const game = setup();
    game.elements['#board-size'].value = '5';
    game.elements['#board-size'].dispatch('change');
    await settle();
    assert.equal(game.elements['.game-board'].children.length, 25);
    assert.equal(game.elements['#status'].textContent, 'Your turn');
    assert.ok(game.elements['.game-board'].children.every((cell) => !cell.disabled));
});

test('all complete rows, columns and diagonals contain a win at each size', () => {
    const game = setup();
    for (const n of [3, 4, 5]) {
        const length = n === 5 ? 4 : 3;
        game.run(`size = ${n}; board = Array(size * size).fill(null); winLines = makeWinLines(size)`);
        const fullLines = [];
        for (let i = 0; i < n; i++) {
            fullLines.push(Array.from({ length: n }, (_, j) => i * n + j));
            fullLines.push(Array.from({ length: n }, (_, j) => j * n + i));
        }
        fullLines.push(Array.from({ length: n }, (_, i) => i * n + i));
        fullLines.push(Array.from({ length: n }, (_, i) => i * n + n - 1 - i));
        for (const line of fullLines) {
            game.run(`board = Array(size * size).fill(null); ${JSON.stringify(line)}.forEach(i => board[i] = 'X')`);
            assert.ok(game.run("findWinningLine('X')"));
            game.run(`board = Array(size * size).fill(null); ${JSON.stringify(line.slice(0, length - 1))}.forEach(i => board[i] = 'X')`);
            assert.equal(game.run("findWinningLine('X')"), null);
        }
    }
});

test('every valid consecutive segment wins, without wrapping or gaps', () => {
    const game = setup();
    for (const n of [3, 4, 5]) {
        const length = n === 5 ? 4 : 3;
        game.run(`size = ${n}; winLines = makeWinLines(size); board = Array(size * size).fill(null)`);
        const expected = [];
        for (let row = 0; row < n; row++) {
            for (let col = 0; col < n; col++) {
                for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
                    const coords = Array.from({ length }, (_, i) => [row + i * dr, col + i * dc]);
                    if (coords.every(([r, c]) => r >= 0 && r < n && c >= 0 && c < n)) {
                        expected.push(coords.map(([r, c]) => r * n + c));
                    }
                }
            }
        }
        const actual = JSON.parse(game.run('JSON.stringify(winLines)'));
        assert.deepEqual(actual.map(String).sort(), expected.map(String).sort());
        assert.equal(new Set(actual.map(String)).size, expected.length);
        for (const line of expected) {
            for (const mark of ['X', 'O']) {
                game.run(`board = Array(size * size).fill(null); ${JSON.stringify(line)}.forEach(i => board[i] = '${mark}')`);
                assert.ok(game.run(`findWinningLine('${mark}')`));
                game.run(`board[${line[Math.floor(length / 2)]}] = null`);
                assert.equal(game.run(`findWinningLine('${mark}')`), null);
            }
        }
        game.run(`board = Array(size * size).fill(null); board[${n - 1}] = 'X'; board[${n}] = 'X'; board[${n + 1}] = 'X'`);
        assert.equal(game.run("findWinningLine('X')"), null);
    }
});

test('shorter offset lines finish games, highlight the line and lock the board', async () => {
    const game = setup();
    for (const [n, line] of [[4, [7, 10, 13]], [5, [9, 13, 17, 21]]]) {
        game.elements['#board-size'].value = String(n);
        game.elements['#board-size'].dispatch('change');
        await settle();
        for (const index of line.slice(0, -1)) {
            assert.equal(game.run(`placeMark(${index}, 'X')`), true);
        }
        assert.equal(game.run(`placeMark(${line.at(-1)}, 'X')`), false);
        const cells = game.elements['.game-board'].children;
        assert.equal(game.elements['#status'].textContent, 'You win');
        assert.deepEqual(cells.map((cell, i) => cell.classList.contains('win') ? i : null).filter((i) => i !== null), [...line].sort((a, b) => a - b));
        assert.ok(cells.every((cell) => cell.disabled));
    }
});

test('a full 5×5 board without a winning line is a draw', async () => {
    const game = setup();
    game.elements['#board-size'].value = '5';
    game.elements['#board-size'].dispatch('change');
    await settle();
    const marks = ['XXOOX', 'OOXXO', 'XXOOX', 'OOXXO', 'XXOOX'].join('').split('');
    game.run(`board = ${JSON.stringify(marks)}; board[24] = null`);
    assert.equal(game.run("findWinningLine('X')"), null);
    assert.equal(game.run("findWinningLine('O')"), null);
    assert.equal(game.run(`placeMark(24, '${marks[24]}')`), false);
    assert.equal(game.elements['#status'].textContent, 'Draw');
    assert.ok(game.elements['.game-board'].children.every((cell) => cell.disabled));
});

test('computer finds immediate wins and blocks immediate threats on every size', () => {
    const game = setup();
    for (const n of [3, 4, 5]) {
        const length = n === 5 ? 4 : 3;
        const start = n === 3 ? 0 : (n - 1) * n;
        game.run(`size = ${n}; winLines = makeWinLines(size); humanMark = 'X'; computerMark = 'O'; board = Array(size * size).fill(null)`);
        game.run(`for (let i = 0; i < ${length - 1}; i++) board[${start} + i] = 'O'`);
        assert.equal(game.run('chooseComputerMove()'), start + length - 1);
        game.run(`board = Array(size * size).fill(null); for (let i = 0; i < ${length - 1}; i++) board[${start} + i] = 'X'`);
        assert.equal(game.run('chooseComputerMove()'), start + length - 1);
        assert.equal(game.run('board.filter(Boolean).length'), length - 1);
    }
});

test('computer wins and blocks offset diagonal threats', () => {
    const game = setup();
    for (const [n, marks, target, support] of [
        [4, [7, 10], 13, [[11, 'X'], [14, 'O'], [15, 'X']]],
        [5, [9, 13, 17], 21, [[14, 'X'], [18, 'O'], [19, 'X'], [22, 'X'], [23, 'O'], [24, 'X']]]
    ]) {
        game.run(`size = ${n}; winLines = makeWinLines(size); humanMark = 'X'; computerMark = 'O'`);
        for (const mark of ['O', 'X']) {
            game.run(`board = Array(size * size).fill(null); ${JSON.stringify(support)}.forEach(([i, m]) => board[i] = m); ${JSON.stringify(marks)}.forEach(i => board[i] = '${mark}')`);
            const before = game.run('JSON.stringify(board)');
            assert.equal(game.run('chooseComputerMove()'), target);
            assert.equal(game.run('JSON.stringify(board)'), before);
        }
    }
});

test('5×5 search is bounded and heuristic scores are finite', () => {
    const game = setup();
    game.run("size = 5; winLines = makeWinLines(size); board = Array(25).fill(null); humanMark = 'X'; computerMark = 'O'");
    assert.ok(Number.isFinite(game.run('evaluateBoard()')));
    game.run("board[0] = 'O'; board[1] = 'O'; board[2] = 'O'; board[3] = 'O'");
    assert.ok(Number.isFinite(game.run('evaluateBoard()')));
    game.run('board = Array(25).fill(null)');
    game.run('var evaluations = 0; var originalEvaluate = evaluateBoard; evaluateBoard = function () { evaluations++; return originalEvaluate(); }');
    const move = game.run('chooseComputerMove()');
    assert.ok(move >= 0 && move < 25);
    assert.ok(game.run('evaluations') > 0);
    assert.ok(game.run('evaluations') <= 25 * 24 * 23);
    assert.equal(game.run('board.filter(Boolean).length'), 0);
});
