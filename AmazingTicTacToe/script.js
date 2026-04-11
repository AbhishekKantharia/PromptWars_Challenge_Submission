/**
 * Quantum Tic-Tac-Toe — Main Game Controller
 * ============================================
 * Handles game logic, AI moves, chaos events, terminal emulator,
 * keyboard accessibility, score tracking, and Google Analytics events.
 *
 * Architecture:
 *  - GameState  : pure data / logic (no DOM)
 *  - UIController: all DOM reads & writes
 *  - Terminal   : sandboxed terminal emulator UI
 */

"use strict";

// ============================================================
// Constants
// ============================================================

/** All eight winning triplets for a 3×3 board. */
const WINNING_CONDITIONS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6],             // diagonals
];

const CHAOS_MESSAGES = [
    "Quantum fluctuation detected. Swapping cells.",
    "System overridden. The AI demands more space.",
    "An anomaly wiped a sector clean.",
    "Reality shifting... recalculating logic.",
    "Glitch in the matrix. Extra turn granted to AI.",
    "Gravitational wave detected — board tilt compensating.",
];

const PLAYER_X = "X";
const PLAYER_O = "O";


// ============================================================
// GameState — Pure logic, no DOM references
// ============================================================

const GameState = (() => {
    let _board = Array(9).fill("");
    let _active = true;
    let _scores = { X: 0, O: 0 };

    /**
     * Check whether any player has won or if it is a draw.
     * @returns {"X"|"O"|"draw"|null}
     */
    function checkOutcome() {
        for (const [a, b, c] of WINNING_CONDITIONS) {
            const val = _board[a];
            if (val && val === _board[b] && val === _board[c]) {
                return val; // winner
            }
        }
        return _board.includes("") ? null : "draw";
    }

    return {
        get board() { return [..._board]; },
        get active() { return _active; },
        get scores() { return { ..._scores }; },

        /** Place a mark on the board. Returns false if the cell is occupied. */
        place(index, player) {
            if (!_active || (index < 0) || (index > 8)) return false;
            if (_board[index] !== "" && !(Math.random() < 0.1 && _board[index] === PLAYER_O)) {
                return false; // occupied (unless quantum overwrite)
            }
            _board[index] = player;
            return true;
        },

        /** Force-clear a specific cell (used by chaos events). */
        clearCell(index) {
            _board[index] = "";
        },

        /** Swap two cells' values (used by chaos events). */
        swapCells(indexA, indexB) {
            [_board[indexA], _board[indexB]] = [_board[indexB], _board[indexA]];
        },

        /** Return indices of cells matching a given value. */
        cellsOf(value) {
            return _board.reduce((acc, v, i) => (v === value ? [...acc, i] : acc), []);
        },

        /** Return indices of empty cells. */
        emptyCells() { return this.cellsOf(""); },

        /** Check outcome and deactivate if the game is over. */
        evalOutcome() {
            const outcome = checkOutcome();
            if (outcome) {
                _active = false;
                if (outcome !== "draw") _scores[outcome]++;
            }
            return outcome;
        },

        /** Reset the board for a new round. */
        reset() {
            _board = Array(9).fill("");
            _active = true;
        },
    };
})();


// ============================================================
// UIController — All DOM interactions
// ============================================================

const UIController = (() => {
    const _elements = {
        board: document.getElementById("board"),
        cells: document.querySelectorAll(".cell"),
        status: document.getElementById("status"),
        eventMsg: document.getElementById("event-msg"),
        resetBtn: document.getElementById("reset-btn"),
        toggleTerminalBtn: document.getElementById("toggle-terminal-btn"),
        scoreX: document.getElementById("score-x"),
        scoreO: document.getElementById("score-o"),
    };

    /** Update the status bar text. */
    function setStatus(text) {
        _elements.status.textContent = text;
    }

    /** Animate and set the event log message. */
    function logEvent(msg) {
        const el = _elements.eventMsg;
        el.textContent = msg;
        el.classList.remove("type-anim");
        // Trigger reflow to restart animation
        void el.offsetHeight;
        el.classList.add("type-anim");
    }

    /** Render a cell as occupied or empty. */
    function renderCell(index, player) {
        const cell = _elements.cells[index];
        cell.textContent = player || "";
        cell.classList.remove("x", "o", "glitch", "winning");
        if (player) cell.classList.add(player.toLowerCase());

        // Accessibility: update aria-label
        const row = Math.floor(index / 3) + 1;
        const col = (index % 3) + 1;
        const state = player ? `occupied by ${player === PLAYER_X ? "Player X" : "AI O"}` : "empty";
        cell.setAttribute("aria-label", `Row ${row}, Column ${col} — ${state}`);
        cell.setAttribute("aria-disabled", player ? "true" : "false");
    }

    /** Highlight winning cells. */
    function highlightWinners(indices) {
        indices.forEach(i => _elements.cells[i].classList.add("winning"));
    }

    /** Flash a glitch effect on a cell. */
    function glitchCell(index) {
        const cell = _elements.cells[index];
        cell.classList.add("glitch");
        setTimeout(() => cell.classList.remove("glitch"), 500);
    }

    /** Update the scoreboard. */
    function updateScores(scores) {
        _elements.scoreX.textContent = scores.X;
        _elements.scoreO.textContent = scores.O;
    }

    /** Reset all cells to their initial visual state. */
    function resetBoard(board) {
        _elements.cells.forEach((cell, i) => renderCell(i, board[i]));
        _elements.board.style.transform = "rotateX(10deg)";
    }

    /** Enable/disable all cells (prevents clicks mid-AI-turn). */
    function setBoardInteractive(enabled) {
        _elements.cells.forEach(cell => {
            cell.setAttribute("aria-disabled", enabled ? "false" : "true");
        });
    }

    return {
        get cells() { return _elements.cells; },
        get resetBtn() { return _elements.resetBtn; },
        get toggleTerminalBtn() { return _elements.toggleTerminalBtn; },
        get board() { return _elements.board; },
        setStatus,
        logEvent,
        renderCell,
        highlightWinners,
        glitchCell,
        updateScores,
        resetBoard,
        setBoardInteractive,
    };
})();


// ============================================================
// Game Controller — Orchestrates GameState + UIController
// ============================================================

const GameController = (() => {
    /** Handle a user's cell click/keypress. */
    function handlePlayerMove(index) {
        if (!GameState.active) return;

        const placed = GameState.place(index, PLAYER_X);
        if (!placed) {
            // Quantum overwrite (already handled inside GameState.place)
            UIController.logEvent("QUANTUM OVERWRITE! You hacked a cell.");
            UIController.glitchCell(index);
            return;
        }

        UIController.renderCell(index, PLAYER_X);
        trackEvent("game_move", "gameplay", `player_x_cell_${index}`);

        const outcome = GameState.evalOutcome();
        if (_handleOutcome(outcome)) return;

        UIController.setStatus("System Calculating…");
        UIController.setBoardInteractive(false);
        setTimeout(computerTurn, 600 + Math.random() * 700);
    }

    /** The AI's turn — may trigger a chaos event. */
    function computerTurn() {
        if (!GameState.active) return;

        if (Math.random() < 0.2) {
            triggerChaos();
        } else {
            const move = _pickAIMove();
            if (move === -1) return;

            GameState.place(move, PLAYER_O);
            UIController.renderCell(move, PLAYER_O);
            trackEvent("game_move", "gameplay", `ai_o_cell_${move}`);
        }

        UIController.setBoardInteractive(true);
        UIController.setStatus("Player X's Turn");

        const outcome = GameState.evalOutcome();
        _handleOutcome(outcome);
    }

    /**
     * Simple AI: win if possible, otherwise block player, otherwise random.
     * @returns {number} chosen index, or -1 if no move available
     */
    function _pickAIMove() {
        const empty = GameState.emptyCells();
        if (empty.length === 0) return -1;

        // Try to win
        const winMove = _findStrategicMove(PLAYER_O, empty);
        if (winMove !== -1) return winMove;

        // Try to block
        const blockMove = _findStrategicMove(PLAYER_X, empty);
        if (blockMove !== -1) return blockMove;

        // Fallback: random
        return empty[Math.floor(Math.random() * empty.length)];
    }

    /** Find a cell that completes a winning triplet for `player`. */
    function _findStrategicMove(player, empty) {
        const board = GameState.board;
        for (const [a, b, c] of WINNING_CONDITIONS) {
            const triplet = [board[a], board[b], board[c]];
            const indices = [a, b, c];
            const playerCount = triplet.filter(v => v === player).length;
            const emptyCount = triplet.filter(v => v === "").length;
            if (playerCount === 2 && emptyCount === 1) {
                const emptyIdx = indices[triplet.indexOf("")];
                if (empty.includes(emptyIdx)) return emptyIdx;
            }
        }
        return -1;
    }

    /** Handle chaos events that run instead of a normal AI move. */
    function triggerChaos() {
        const xCells = GameState.cellsOf(PLAYER_X);
        const oCells = GameState.cellsOf(PLAYER_O);
        const empty = GameState.emptyCells();
        const chaosType = Math.floor(Math.random() * 4);

        UIController.logEvent(CHAOS_MESSAGES[Math.floor(Math.random() * CHAOS_MESSAGES.length)]);
        trackEvent("chaos_event", "gameplay", `chaos_type_${chaosType}`);

        switch (chaosType) {
            case 0: // Wipe a player's cell
                if (xCells.length > 0) {
                    const target = xCells[Math.floor(Math.random() * xCells.length)];
                    GameState.clearCell(target);
                    UIController.renderCell(target, "");
                    UIController.glitchCell(target);
                }
                break;

            case 1: // Swap X and O cells
                if (xCells.length > 0 && oCells.length > 0) {
                    const xT = xCells[Math.floor(Math.random() * xCells.length)];
                    const oT = oCells[Math.floor(Math.random() * oCells.length)];
                    GameState.swapCells(xT, oT);
                    UIController.renderCell(xT, GameState.board[xT]);
                    UIController.renderCell(oT, GameState.board[oT]);
                    UIController.glitchCell(xT);
                    UIController.glitchCell(oT);
                }
                break;

            case 2: // AI places two pieces
                if (empty.length > 1) {
                    for (let i = 0; i < 2 && GameState.emptyCells().length > 0; i++) {
                        const avail = GameState.emptyCells();
                        const move = avail[Math.floor(Math.random() * avail.length)];
                        GameState.place(move, PLAYER_O);
                        UIController.renderCell(move, PLAYER_O);
                    }
                }
                break;

            case 3: // Visual board tilt
                UIController.board.style.transform =
                    `rotateX(${Math.random() * 40 - 20}deg) rotateY(${Math.random() * 40 - 20}deg)`;
                setTimeout(() => {
                    UIController.board.style.transform = "rotateX(10deg)";
                }, 1200);
                break;
        }
    }

    /**
     * Process and display a game outcome.
     * @returns {boolean} true if the game ended
     */
    function _handleOutcome(outcome) {
        if (!outcome) return false;

        UIController.updateScores(GameState.scores);

        if (outcome === "draw") {
            UIController.setStatus("Quantum Entanglement — It's a Draw!");
            UIController.logEvent("A stalemate in the spacetime continuum.");
            trackEvent("game_draw", "gameplay", "draw");
        } else {
            const isHuman = outcome === PLAYER_X;
            UIController.setStatus(`System Alert: ${outcome} Wins!`);
            UIController.logEvent(
                isHuman ? "Humanity prevails… for now." : "System overridden. You lose."
            );
            // Highlight winning cells
            for (const [a, b, c] of WINNING_CONDITIONS) {
                const b_ = GameState.board;
                if (b_[a] === outcome && b_[b] === outcome && b_[c] === outcome) {
                    UIController.highlightWinners([a, b, c]);
                    break;
                }
            }
            trackEvent("game_end", "gameplay", isHuman ? "player_x_wins" : "ai_wins");
        }

        UIController.setBoardInteractive(false);
        return true;
    }

    /** Reset game state and UI for a new round. */
    function resetGame() {
        GameState.reset();
        UIController.resetBoard(GameState.board);
        UIController.setStatus("Player X's Turn");
        UIController.logEvent("System rebooted. New sequence initialized.");
        UIController.setBoardInteractive(true);
        trackEvent("game_reset", "gameplay", "new_game");
    }

    return { handlePlayerMove, resetGame };
})();


// ============================================================
// Keyboard Grid Navigation (WCAG 2.1 Arrow-key navigation)
// ============================================================

(function initKeyboardNav() {
    const cells = UIController.cells;

    cells.forEach((cell, index) => {
        cell.addEventListener("keydown", (e) => {
            let targetIndex = -1;
            if (e.key === "ArrowRight") targetIndex = index + 1 < 9 ? index + 1 : index;
            else if (e.key === "ArrowLeft") targetIndex = index - 1 >= 0 ? index - 1 : index;
            else if (e.key === "ArrowDown") targetIndex = index + 3 < 9 ? index + 3 : index;
            else if (e.key === "ArrowUp") targetIndex = index - 3 >= 0 ? index - 3 : index;
            else if (e.key === "Home") targetIndex = 0;
            else if (e.key === "End") targetIndex = 8;

            if (targetIndex !== -1 && targetIndex !== index) {
                e.preventDefault();
                // Update roving tabindex
                cells[index].setAttribute("tabindex", "-1");
                cells[targetIndex].setAttribute("tabindex", "0");
                cells[targetIndex].focus();
            }

            // Enter or Space triggers the move
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                GameController.handlePlayerMove(index);
            }
        });

        cell.addEventListener("click", () => {
            GameController.handlePlayerMove(index);
        });
    });

    // Reset roving tabindex so first cell is always focusable after reset
    UIController.resetBtn.addEventListener("click", () => {
        cells.forEach((c, i) => c.setAttribute("tabindex", i === 0 ? "0" : "-1"));
        GameController.resetGame();
    });
})();


// ============================================================
// Terminal Emulator
// ============================================================

const Terminal = (() => {
    const _section = document.getElementById("terminal-section");
    const _toggle = UIController.toggleTerminalBtn;
    const _closeBtn = document.getElementById("close-terminal-btn");
    const _output = document.getElementById("terminal-output");
    const _input = document.getElementById("terminal-input");
    const _commandHistory = [];
    let _historyIndex = -1;

    function _appendLine(text, className = "") {
        const div = document.createElement("div");
        div.className = `log-line ${className}`.trim();
        div.textContent = text;
        _output.appendChild(div);
        _output.scrollTop = _output.scrollHeight;
    }

    function _clearOutput() {
        _output.innerHTML = "";
        _appendLine("Quantum Tic-Tac-Toe Secure Terminal v2.0", "system-msg");
        _appendLine("Running on Google Cloud Run ☁️", "system-msg");
        _appendLine("⚠  Only safe, allowlisted commands are permitted.", "system-msg");
        _appendLine("──────────────────────────────────────", "system-msg");
    }

    /** Open/close the terminal panel. */
    function _toggleVisibility() {
        const isHidden = _section.classList.toggle("hidden");
        _section.setAttribute("aria-hidden", isHidden ? "true" : "false");
        _toggle.setAttribute("aria-expanded", isHidden ? "false" : "true");
        if (!isHidden) {
            _input.focus();
            trackEvent("terminal_open", "terminal", "toggle");
        }
    }

    /** Submit a command to the backend API. */
    async function _submitCommand(cmd) {
        _appendLine(`quantum@cloud:~$ ${cmd}`, "user-cmd");
        _commandHistory.unshift(cmd);
        _historyIndex = -1;

        if (cmd.toLowerCase() === "clear" || cmd.toLowerCase() === "cls") {
            _clearOutput();
            return;
        }

        _appendLine("Processing…", "system-msg");
        trackEvent("terminal_command", "terminal", cmd.split(" ")[0]);

        try {
            const response = await fetch("/run_command", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ command: cmd }),
                signal: AbortSignal.timeout(8000), // 8-second client-side timeout
            });

            // Remove "Processing…" line
            _output.removeChild(_output.lastChild);

            const data = await response.json();

            if (data.stdout && data.stdout !== "__CLEAR__") {
                data.stdout.split("\n").forEach(line => _appendLine(line));
            } else if (data.stdout === "__CLEAR__") {
                _clearOutput();
                return;
            }

            if (data.stderr) {
                _appendLine(`⚠ ${data.stderr}`, "error-msg");
            }

            if (response.status === 403) {
                _appendLine("🔒 Command blocked by security sandbox.", "error-msg");
            } else if (response.status === 429) {
                _appendLine("⏱ Rate limit reached. Please wait a moment.", "error-msg");
            }

        } catch (err) {
            _output.removeChild(_output.lastChild);
            if (err.name === "TimeoutError") {
                _appendLine("⏱ Request timed out (8s).", "error-msg");
            } else {
                _appendLine("🔌 Connection error. Is the server running?", "error-msg");
            }
        }
    }

    // --- Event listeners ---
    _toggle.addEventListener("click", _toggleVisibility);
    _closeBtn.addEventListener("click", _toggleVisibility);

    // Close on Escape key when terminal is focused
    _section.addEventListener("keydown", (e) => {
        if (e.key === "Escape") _toggleVisibility();
    });

    _input.addEventListener("keydown", async (e) => {
        const cmd = _input.value.trim();

        if (e.key === "Enter" && cmd) {
            _input.value = "";
            await _submitCommand(cmd);
        }

        // History navigation
        if (e.key === "ArrowUp") {
            e.preventDefault();
            _historyIndex = Math.min(_historyIndex + 1, _commandHistory.length - 1);
            _input.value = _commandHistory[_historyIndex] || "";
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            _historyIndex = Math.max(_historyIndex - 1, -1);
            _input.value = _historyIndex >= 0 ? _commandHistory[_historyIndex] : "";
        }
    });
})();


// ============================================================
// Google Analytics event helper (graceful if gtag not loaded)
// ============================================================

function trackEvent(action, category, label) {
    if (typeof gtag === "function") {
        gtag("event", action, { event_category: category, event_label: label });
    }
}
