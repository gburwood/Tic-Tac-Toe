# Tic-Tac-Toe

A browser-based game against the computer, using plain HTML, CSS and JavaScript. Open `TTT.html` in a browser to play; no build or dependencies are required.

Choose a 3×3, 4×4 or 5×5 board. The default is 3×3. Changing the size immediately discards the current game and starts a new one; **New game** keeps the selected size. A coin toss determines who starts, and X always plays first.

On 3×3, choose an empty cell. On 4×4 and 5×5, select any cell in a column, including an occupied cell: the mark lands in that column's lowest empty row. Full columns cannot be selected. The computer follows the same gravity rule. Both players' marks fall and bounce into place; the board stays locked until the mark settles. With reduced motion enabled, marks appear immediately. Resetting or changing size cancels a drop.

Win with three consecutive marks on 3×3 or 4×4, or four consecutive marks on 5×5. Lines can appear anywhere horizontally, vertically or diagonally. A full board without a winner is a draw. The computer uses the same winning rules, with full minimax on 3×3 and a depth-limited search on 4×4 and 5×5, so its play on larger boards is not guaranteed to be perfect.

These are single-board variants, not Ultimate Tic Tac Toe.

## Tests

With Node.js installed, run `node --test tests/game.test.js tests/gravity.test.js tests/animation.test.js`. The tests use only Node's built-in modules; the game itself does not require Node.js. They mock the DOM; visual animation and assistive-technology behavior should also be checked in a browser.
