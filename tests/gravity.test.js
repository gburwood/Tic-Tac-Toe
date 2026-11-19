const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'TTT.js'), 'utf8');

class Element {
    constructor() {
        this.children = [];
        this.dataset = {};
        this.attributes = {};
        this.listeners = {};
        this.disabled = false;
        this.textContent = '';
        this.value = '';
        this.style = { setProperty() {} };
        const classes = new Set();
        this.classList = {
            add: (...names) => names.forEach((name) => classes.add(name)),
            remove: (...names) => names.forEach((name) => classes.delete(name)),
            contains: (name) => classes.has(name)
        };
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, fn) { (this.listeners[name] ??= []).push(fn); }
    removeEventListener(name, fn) { this.listeners[name] = (this.listeners[name] || []).filter((item) => item !== fn); }
    click() { if (!this.disabled) (this.listeners.click || []).forEach((fn) => fn({ target: this })); }
    dispatch(name) { (this.listeners[name] || []).forEach((fn) => fn({ target: this })); }
    appendChild(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
}

function setup(random = 0) {
    const elements = Object.fromEntries(['.game-board', '#board-size', '#status', '#matchup', '#reset', '#coin'].map((name) => [name, new Element()]));
    elements['#board-size'].value = '3';
    const timers = new Map();
    let nextTimer = 0;
    const math = Object.create(Math);
    math.random = () => random;
    const context = vm.createContext({
        document: { querySelector: (name) => elements[name], createElement: () => new Element() },
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
        flushTimers() {
            const pending = [...timers.values()];
            timers.clear();
            pending.forEach((fn) => fn());
        },
        timerCount: () => timers.size
    };
}

async function select(game, size) {
    game.elements['#board-size'].value = String(size);
    game.elements['#board-size'].dispatch('change');
    await Promise.resolve();
}

test('any cell, including an occupied cell, drops into its column on both gravity boards', async () => {
    for (const n of [4, 5]) {
        const game = setup();
        await select(game, n);
        const cells = game.elements['.game-board'].children;
        const bottom = (n - 1) * n + 1;
        cells[1].click();
        assert.equal(cells[bottom].textContent, 'X');
        assert.equal(cells[1].textContent, '');
        assert.ok(cells.every((cell) => cell.disabled));
        game.flushTimers();
        assert.equal(game.elements['#status'].textContent, 'Your turn');
        assert.equal(cells[bottom].disabled, false);
        const expected = game.run('landingCell(1)');
        assert.match(cells[bottom].attributes['aria-label'], /drop in column 2, lands in row/);
        cells[bottom].click();
        assert.equal(cells[expected].textContent, 'X');
        assert.equal(game.run('board.filter(Boolean).length'), 3);
    }
});

test('full columns are disabled and rejected without changing state or scheduling a turn', async () => {
    for (const n of [4, 5]) {
        const game = setup();
        await select(game, n);
        game.run(`for (let row = 0; row < size; row++) { board[row * size] = row % 2 ? 'X' : 'O'; } unlockEmptyCells()`);
        const cells = game.elements['.game-board'].children;
        for (let row = 0; row < n; row++) {
            assert.equal(cells[row * n].disabled, true);
            assert.equal(game.run(`landingCell(${row * n})`), null);
        }
        const before = game.run('JSON.stringify(board)');
        game.run('playHumanMove(0)');
        assert.equal(game.run('JSON.stringify(board)'), before);
        assert.equal(game.elements['#status'].textContent, 'Your turn');
        assert.equal(game.timerCount(), 0);
        assert.equal(cells[1].disabled, false);
    }
});

test('computer opening and subsequent search only use legal landing cells at every depth', async () => {
    for (const n of [4, 5]) {
        const game = setup(0.9);
        await select(game, n);
        assert.equal(game.elements['#status'].textContent, "Computer's turn");
        game.flushTimers();
        const cells = game.elements['.game-board'].children;
        const marked = cells.map((cell, index) => cell.textContent ? index : -1).filter((index) => index >= 0);
        assert.equal(marked.length, 1);
        assert.ok(marked[0] >= (n - 1) * n);
        assert.equal(cells[marked[0]].textContent, 'X');
        game.run(`
            var originalMinimax = minimax;
            var visited = 0;
            minimax = function(player, depth, alpha, beta) {
                visited++;
                for (let col = 0; col < size; col++) {
                    let emptyBelow = false;
                    for (let row = size - 1; row >= 0; row--) {
                        if (!board[row * size + col]) emptyBelow = true;
                        else if (emptyBelow) throw new Error('floating simulated mark');
                    }
                }
                return originalMinimax(player, depth, alpha, beta);
            };
        `);
        const before = game.run('JSON.stringify(board)');
        const legal = JSON.parse(game.run('JSON.stringify(legalMoves())'));
        const chosen = game.run('chooseComputerMove()');
        assert.ok(legal.includes(chosen));
        assert.ok(game.run('visited') > 1);
        assert.equal(game.run('JSON.stringify(board)'), before);
    }
});

test('3×3 retains direct cell selection and occupied cells are unavailable', async () => {
    const game = setup();
    await Promise.resolve();
    const cells = game.elements['.game-board'].children;
    cells[1].click();
    assert.equal(cells[1].textContent, 'X');
    assert.equal(cells[7].textContent, '');
    game.flushTimers();
    assert.equal(cells[1].disabled, true);
    const before = game.run('JSON.stringify(board)');
    game.run('playHumanMove(1)');
    assert.equal(game.run('JSON.stringify(board)'), before);
    assert.equal(game.timerCount(), 0);
});

test('gravity moves can finish a game and highlight the actual landing line', async () => {
    for (const n of [4, 5]) {
        const game = setup();
        await select(game, n);
        const length = n === 5 ? 4 : 3;
        const start = (n - 1) * n;
        game.run(`for (let col = 0; col < ${length - 1}; col++) placeMark(${start} + col, 'X'); unlockEmptyCells()`);
        const cells = game.elements['.game-board'].children;
        cells[length - 1].click();
        assert.equal(game.elements['#status'].textContent, 'You win');
        assert.equal(cells[start + length - 1].textContent, 'X');
        for (let col = 0; col < length; col++) assert.ok(cells[start + col].classList.contains('win'));
        assert.ok(cells.every((cell) => cell.disabled));
        assert.equal(game.timerCount(), 0);
    }
});
