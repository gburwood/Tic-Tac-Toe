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
        this.listeners = {};
        this.attributes = {};
        this.dataset = {};
        this.styles = {};
        this.style = { setProperty: (name, value) => { this.styles[name] = value; } };
        this.textContent = '';
        this.value = '';
        this.disabled = false;
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
    dispatch(name, details = {}) { for (const fn of [...(this.listeners[name] || [])]) fn({ target: this, ...details }); }
    click() { if (!this.disabled) this.dispatch('click'); }
    appendChild(child) { child.parent = this; this.children.push(child); }
    replaceChildren() { this.children.forEach((child) => { child.parent = null; }); this.children = []; }
    remove() { if (this.parent) { this.parent.children = this.parent.children.filter((child) => child !== this); this.parent = null; } }
    getBoundingClientRect() {
        const index = this.parent.children.indexOf(this);
        const n = Number(this.parent.styles['--board-size']);
        return { top: Math.floor(index / n) * 100, height: 90 };
    }
}

function setup(random = 0, reduced = false) {
    const elements = Object.fromEntries(['.game-board', '#board-size', '#status', '#matchup', '#reset', '#coin'].map((key) => [key, new Element()]));
    elements['#board-size'].value = '3';
    const timers = new Map();
    let nextTimer = 0;
    const math = Object.create(Math);
    math.random = () => random;
    const context = vm.createContext({
        document: { querySelector: (name) => elements[name], createElement: () => new Element() },
        window: {
            matchMedia: () => ({ matches: reduced }),
            setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
            clearTimeout: (id) => timers.delete(id)
        },
        Math: math
    });
    vm.runInContext(source, context);
    return {
        elements,
        run: (code) => vm.runInContext(code, context),
        runDelay(delay) {
            const entry = [...timers].find(([, timer]) => timer.delay === delay);
            assert.ok(entry, `missing ${delay}ms timer`);
            timers.delete(entry[0]);
            entry[1].fn();
        },
        timerCount: () => timers.size
    };
}

async function select(game, n, reduced = false) {
    game.elements['#board-size'].value = String(n);
    game.elements['#board-size'].dispatch('change');
    if (!reduced) game.elements['#coin'].dispatch('animationend');
    await Promise.resolve();
}

function finish(visual, event = 'animationend') {
    visual.dispatch(event, { animationName: 'drop-mark' });
}

test('human and computer gravity moves wait for the drop and lock the board', async () => {
    for (const n of [4, 5]) {
        const game = setup();
        await select(game, n);
        const board = game.elements['.game-board'];
        const cells = [...board.children];
        const target = (n - 1) * n + 1;
        cells[1].click();
        const visual = board.children.at(-1);
        assert.equal(visual.className, 'falling-mark x');
        assert.equal(visual.attributes['aria-hidden'], 'true');
        assert.equal(visual.style.gridColumn, '2');
        assert.equal(visual.style.gridRow, String(n));
        assert.equal(visual.styles['--drop-distance'], `${(n - 1) * 100 + 90}px`);
        assert.equal(cells[target].textContent, '');
        assert.equal(game.run('board.filter(Boolean).length'), 0);
        assert.ok(cells.every((cell) => cell.disabled));
        game.run('playHumanMove(2)');
        assert.equal(game.run('board.filter(Boolean).length'), 0);
        visual.dispatch('animationend', { animationName: 'other' });
        assert.equal(cells[target].textContent, '');
        finish(visual);
        assert.equal(cells[target].textContent, 'X');
        assert.equal(game.elements['#status'].textContent, "Computer's turn");
        game.runDelay(450);
        const computerVisual = board.children.at(-1);
        assert.equal(computerVisual.className, 'falling-mark o');
        assert.equal(game.run('board.filter(Boolean).length'), 1);
        assert.ok(cells.every((cell) => cell.disabled));
        finish(computerVisual);
        assert.equal(game.run('board.filter(Boolean).length'), 2);
        assert.equal(game.elements['#status'].textContent, 'Your turn');
        assert.ok(cells.some((cell) => !cell.disabled));
    }
});

test('a shorter drop targets the actual landing row and wins are deferred', async () => {
    for (const n of [4, 5]) {
        const game = setup();
        await select(game, n);
        const board = game.elements['.game-board'];
        const cells = [...board.children];
        const length = n === 5 ? 4 : 3;
        const bottom = (n - 1) * n;
        game.run(`for (let i = 0; i < ${length - 1}; i++) placeMark(${bottom} + i, 'X'); unlockEmptyCells()`);
        cells[length - 1].click();
        const visual = board.children.at(-1);
        assert.notEqual(game.elements['#status'].textContent, 'You win');
        assert.ok(cells.every((cell) => !cell.classList.contains('win')));
        finish(visual);
        assert.equal(game.elements['#status'].textContent, 'You win');
        assert.ok(cells[bottom + length - 1].classList.contains('win'));
        assert.equal(game.timerCount(), 0);

        await select(game, n);
        const fresh = game.elements['.game-board'];
        const freshCells = [...fresh.children];
        game.run(`placeMark(${bottom}, 'O'); unlockEmptyCells()`);
        freshCells[bottom].click();
        const higher = fresh.children.at(-1);
        assert.equal(higher.style.gridRow, String(n - 1));
        assert.equal(higher.styles['--drop-distance'], `${(n - 2) * 100 + 90}px`);
        finish(higher);
        assert.equal(freshCells[bottom - n].textContent, 'X');
    }
});

test('draw is announced only after the final animated landing', async () => {
    const game = setup();
    await select(game, 5);
    const marks = ['XXOOX', 'OOXXO', 'XXOOX', 'OOXXO', 'XXOOX'].join('').split('');
    game.run(`board = ${JSON.stringify(marks)}; board[4] = null; unlockEmptyCells()`);
    const board = game.elements['.game-board'];
    board.children[4].click();
    const visual = board.children.at(-1);
    assert.notEqual(game.elements['#status'].textContent, 'Draw');
    finish(visual);
    assert.equal(game.elements['#status'].textContent, 'Draw');
    assert.equal(game.timerCount(), 0);
});

test('reset and size changes cancel drops and stale callbacks cannot modify the new game', async () => {
    for (const changeSize of [false, true]) {
        const game = setup();
        await select(game, 4);
        const board = game.elements['.game-board'];
        board.children[0].click();
        const visual = board.children.at(-1);
        const stale = [...visual.listeners.animationend];
        if (changeSize) {
            game.elements['#board-size'].value = '5';
            game.elements['#board-size'].dispatch('change');
        } else {
            game.elements['#reset'].dispatch('click');
        }
        assert.equal(visual.parent, null);
        stale.forEach((fn) => fn({ target: visual, animationName: 'drop-mark' }));
        game.elements['#coin'].dispatch('animationend');
        await Promise.resolve();
        assert.equal(game.run('board.filter(Boolean).length'), 0);
        assert.equal(game.elements['#status'].textContent, 'Your turn');
        assert.equal(board.children.length, changeSize ? 25 : 16);
        assert.equal(game.timerCount(), 0);
    }
});

test('animation cancellation and fallback timer finish only once', async () => {
    for (const mode of ['cancel', 'timer']) {
        const game = setup();
        await select(game, 4);
        const board = game.elements['.game-board'];
        board.children[0].click();
        const visual = board.children.at(-1);
        if (mode === 'cancel') finish(visual, 'animationcancel');
        else game.runDelay(800);
        finish(visual);
        assert.equal(game.run('board.filter(Boolean).length'), 1);
        assert.equal(game.elements['#status'].textContent, "Computer's turn");
        assert.equal(game.timerCount(), 1);
    }
});

test('reduced motion and 3×3 place marks immediately', async () => {
    const reduced = setup(0, true);
    await select(reduced, 5, true);
    const board = reduced.elements['.game-board'];
    board.children[0].click();
    assert.equal(board.children.length, 25);
    assert.equal(board.children[20].textContent, 'X');
    assert.equal(reduced.elements['#status'].textContent, "Computer's turn");
    reduced.runDelay(450);
    assert.equal(reduced.run('board.filter(Boolean).length'), 2);
    assert.equal(reduced.elements['#status'].textContent, 'Your turn');

    const normal = setup();
    normal.elements['#coin'].dispatch('animationend');
    await Promise.resolve();
    const small = normal.elements['.game-board'];
    small.children[0].click();
    assert.equal(small.children.length, 9);
    assert.equal(small.children[0].textContent, 'X');
});

test('stylesheet supplies a bouncing, reduced-motion-aware drop', () => {
    const css = fs.readFileSync(path.join(root, 'TTT.css'), 'utf8');
    assert.match(css, /animation:\s*drop-mark\s+550ms/);
    assert.match(css, /@keyframes\s+drop-mark/);
    assert.match(css, /translateY\(-14px\)/);
    assert.match(css, /prefers-reduced-motion:\s*reduce[^}]*\.falling-mark\s*\{\s*animation:\s*none/s);
});
