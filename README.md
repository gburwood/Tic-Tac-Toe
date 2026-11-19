# Tic-Tac-Toe

A browser-based game against the computer, using plain HTML, CSS and JavaScript. Open `TTT.html` in a browser to play; no build or dependencies are required.

Choose a 3×3, 4×4 or 5×5 board. The default is 3×3. Changing the size immediately discards the current game and starts a new one; **New game** keeps the selected size. A coin toss determines who starts, and X always plays first.

Win by filling a row, column or main diagonal with your marks: three in a row on 3×3, four on 4×4, or five on 5×5. A full board without a winner is a draw. The computer uses full minimax on 3×3 and a depth-limited search on 4×4 and 5×5, so its play on larger boards is not guaranteed to be perfect.

These are standard single-board variants, not Ultimate Tic Tac Toe.

## Tests

With Node.js installed, run `node --test tests/game.test.js`. The tests use only Node's built-in modules; the game itself does not require Node.js.
