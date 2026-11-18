# Tic-Tac-Toe

A browser-based game against the computer, using plain HTML, CSS and JavaScript. Open `TTT.html` in a browser to play; no build or dependencies are required.

Choose a 3×3 or 4×4 board. The default is 3×3. Changing the size immediately discards the current game and starts a new one; **New game** keeps the selected size. A coin toss determines who starts, and X always plays first.

Win by filling a row, column or diagonal with your marks: three in a row on 3×3, or four in a row on 4×4. A full board without a winner is a draw. The computer uses full minimax on 3×3 and a depth-limited search on 4×4, so its 4×4 play is not guaranteed to be perfect.

These are standard single-board variants, not Ultimate Tic Tac Toe.
