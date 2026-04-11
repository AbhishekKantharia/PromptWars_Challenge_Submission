/**
 * Quantum Tic-Tac-Toe — Main Game Controller
 * ============================================
 * Modules:
 *  - GameState       : pure board logic (no DOM)
 *  - UIController    : all DOM reads & writes
 *  - GameController  : orchestrates GameState + UIController + Firebase
 *  - Leaderboard     : Firebase Realtime Database UI
 *  - Terminal        : sandboxed terminal emulator UI
 *
 * Google Services used:
 *  - Firebase Authentication (anonymous sign-in via firebase-config.js)
 *  - Firebase Realtime Database (global leaderboard)
 *  - Firebase Analytics (game events)
 *  - Google Analytics 4  (gtag events)
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
    let _board   = Array(9).fill("");
    let _active  = true;
    let _scores  = { X: 0, O: 0 };
    let _gamesPlayed = 0;

    /**
     * Check all winning conditions on the current board.
     * @returns {"X"|"O"|"draw"|null}
     */
    function _checkOutcome() {
        for (const [a, b, c] of WINNING_CONDITIONS) {
            const val = _board[a];
            if (val && val === _board[b] && val === _board[c]) return val;
        }
        return _board.includes("") ? null : "draw";
    }

    return {
        get board()       { return [..._board]; },
        get active()      { return _active; },
        get scores()      { return { ..._scores }; },
        get gamesPlayed() { return _gamesPlayed; },

        /**
         * Place a mark. Returns false if cell is occupied (unless quantum overwrite).
         * @param {number} index - cell index 0-8
         * @param {string} player - "X" or "O"
         * @returns {boolean}
         */
        place(index, player) {
            if (!_active || index < 0 || index > 8) return false;
            if (_board[index] !== "") {
                // 10% quantum overwrite chance only on opponent's cells
                if (Math.random() < 0.1 && _board[index] === PLAYER_O && player === PLAYER_X) {
                    UIController.logEvent("QUANTUM OVERWRITE! You hacked a cell.");
                    UIController.glitchCell(index);
                }
                return false;
            }
            _board[index] = player;
            return true;
        },

        /** Clear a cell (chaos events). */
        clearCell(index) { _board[index] = ""; },

        /** Swap two cells (chaos events). */
        swapCells(a, b)  { [_board[a], _board[b]] = [_board[b], _board[a]]; },

        /** Return indices of cells matching value. */
        cellsOf(value)  { return _board.reduce((acc, v, i) => (v === value ? [...acc, i] : acc), []); },

        /** Return indices of empty cells. */
        emptyCells()    { return this.cellsOf(""); },

        /**
         * Evaluate current outcome and deactivate if game over.
         * @returns {"X"|"O"|"draw"|null}
         */
        evalOutcome() {
            const outcome = _checkOutcome();
            if (outcome) {
                _active = false;
                _gamesPlayed++;
                if (outcome !== "draw") _scores[outcome]++;
            }
            return outcome;
        },

        /** Reset the board for a new round. */
        reset() {
            _board  = Array(9).fill("");
            _active = true;
        },
    };
})();


// ============================================================
// UIController — All DOM interactions
// ============================================================

const UIController = (() => {
    const _el = {
        board:           document.getElementById("board"),
        cells:           document.querySelectorAll(".cell"),
        status:          document.getElementById("status"),
        eventMsg:        document.getElementById("event-msg"),
        resetBtn:        document.getElementById("reset-btn"),
        toggleTermBtn:   document.getElementById("toggle-terminal-btn"),
        toggleLbBtn:     document.getElementById("toggle-leaderboard-btn"),
        scoreX:          document.getElementById("score-x"),
        scoreO:          document.getElementById("score-o"),
        fbStatusDot:     document.getElementById("firebase-status-dot"),
        fbStatusText:    document.getElementById("firebase-status-text"),
    };

    /** Update the game-status bar. */
    function setStatus(text) { _el.status.textContent = text; }

    /** Animate and set the event log message. */
    function logEvent(msg) {
        const el = _el.eventMsg;
        el.textContent = msg;
        el.classList.remove("type-anim");
        void el.offsetHeight;             // trigger reflow
        el.classList.add("type-anim");
    }

    /**
     * Render a cell's visual state.
     * @param {number} index
     * @param {string|null} player - "X", "O", or null/empty
     */
    function renderCell(index, player) {
        const cell = _el.cells[index];
        cell.textContent = player || "";
        cell.classList.remove("x", "o", "glitch", "winning");
        if (player) cell.classList.add(player.toLowerCase());

        // Accessibility: update aria-label dynamically
        const row   = Math.floor(index / 3) + 1;
        const col   = (index % 3) + 1;
        const state = player
            ? `occupied by ${player === PLAYER_X ? "Player X" : "AI O"}`
            : "empty";
        cell.setAttribute("aria-label",    `Row ${row}, Column ${col} — ${state}`);
        cell.setAttribute("aria-disabled", player ? "true" : "false");
    }

    /** Add winning-pulse class to winning cells. */
    function highlightWinners(indices) {
        indices.forEach(i => _el.cells[i].classList.add("winning"));
    }

    /** Flash glitch animation on a cell. */
    function glitchCell(index) {
        const cell = _el.cells[index];
        cell.classList.add("glitch");
        setTimeout(() => cell.classList.remove("glitch"), 500);
    }

    /** Update the session scoreboard. */
    function updateScores(scores) {
        _el.scoreX.textContent = scores.X;
        _el.scoreO.textContent = scores.O;
    }

    /** Reset all cells visually. */
    function resetBoard() {
        _el.cells.forEach((cell, i) => renderCell(i, null));
        _el.board.style.transform = "rotateX(10deg)";
    }

    /** Enable or disable board interaction during AI turn. */
    function setBoardInteractive(enabled) {
        _el.cells.forEach(cell =>
            cell.setAttribute("aria-disabled", enabled ? "false" : "true")
        );
    }

    /**
     * Update Firebase connection status indicator.
     * @param {"connected"|"disconnected"|"connecting"} state
     */
    function setFirebaseStatus(state) {
        const dot  = _el.fbStatusDot;
        const text = _el.fbStatusText;
        dot.className = `status-dot ${state}`;
        const labels = {
            connected:    "🔥 Firebase connected",
            disconnected: "⚠ Firebase offline — local mode",
            connecting:   "Connecting to Firebase…",
        };
        text.textContent = labels[state] || "";
    }

    return {
        get cells()         { return _el.cells; },
        get resetBtn()      { return _el.resetBtn; },
        get toggleTermBtn() { return _el.toggleTermBtn; },
        get toggleLbBtn()   { return _el.toggleLbBtn; },
        get board()         { return _el.board; },
        setStatus,
        logEvent,
        renderCell,
        highlightWinners,
        glitchCell,
        updateScores,
        resetBoard,
        setBoardInteractive,
        setFirebaseStatus,
    };
})();


// ============================================================
// Game Controller — Orchestrates GameState + UI + Firebase
// ============================================================

const GameController = (() => {

    /** Handle the player's cell click or keyboard activation. */
    function handlePlayerMove(index) {
        if (!GameState.active) return;

        const placed = GameState.place(index, PLAYER_X);
        if (!placed) return;

        UIController.renderCell(index, PLAYER_X);
        _trackEvent("game_move", "gameplay", `player_x_cell_${index}`);

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
            _triggerChaos();
        } else {
            const move = _pickAIMove();
            if (move === -1) return;
            GameState.place(move, PLAYER_O);
            UIController.renderCell(move, PLAYER_O);
            _trackEvent("game_move", "gameplay", `ai_o_cell_${move}`);
        }

        UIController.setBoardInteractive(true);
        UIController.setStatus("Player X's Turn");

        const outcome = GameState.evalOutcome();
        _handleOutcome(outcome);
    }

    /**
     * Strategic AI: win > block > random.
     * @returns {number} chosen index, or -1
     */
    function _pickAIMove() {
        const empty = GameState.emptyCells();
        if (empty.length === 0) return -1;

        const winMove   = _findStrategicMove(PLAYER_O, empty);
        if (winMove   !== -1) return winMove;

        const blockMove = _findStrategicMove(PLAYER_X, empty);
        if (blockMove !== -1) return blockMove;

        return empty[Math.floor(Math.random() * empty.length)];
    }

    /**
     * Find a move that completes (or blocks) a winning triplet.
     * @param {string} player
     * @param {number[]} empty - indices of empty cells
     * @returns {number}
     */
    function _findStrategicMove(player, empty) {
        const board = GameState.board;
        for (const [a, b, c] of WINNING_CONDITIONS) {
            const triplet = [board[a], board[b], board[c]];
            const indices = [a, b, c];
            if (
                triplet.filter(v => v === player).length === 2 &&
                triplet.filter(v => v === "").length === 1
            ) {
                const emptyIdx = indices[triplet.indexOf("")];
                if (empty.includes(emptyIdx)) return emptyIdx;
            }
        }
        return -1;
    }

    /** Execute a random chaos event. */
    function _triggerChaos() {
        const xCells = GameState.cellsOf(PLAYER_X);
        const oCells = GameState.cellsOf(PLAYER_O);
        const empty  = GameState.emptyCells();
        const type   = Math.floor(Math.random() * 4);

        UIController.logEvent(CHAOS_MESSAGES[Math.floor(Math.random() * CHAOS_MESSAGES.length)]);
        _trackEvent("chaos_event", "gameplay", `chaos_type_${type}`);
        FirebaseService.logAnalyticsEvent("chaos_triggered", { chaos_type: type });

        switch (type) {
            case 0: // Wipe a player cell
                if (xCells.length > 0) {
                    const t = xCells[Math.floor(Math.random() * xCells.length)];
                    GameState.clearCell(t);
                    UIController.renderCell(t, "");
                    UIController.glitchCell(t);
                }
                break;

            case 1: // Swap X and O
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
                for (let i = 0; i < 2 && GameState.emptyCells().length > 0; i++) {
                    const avail = GameState.emptyCells();
                    const move  = avail[Math.floor(Math.random() * avail.length)];
                    GameState.place(move, PLAYER_O);
                    UIController.renderCell(move, PLAYER_O);
                }
                break;

            case 3: // Board visual tilt
                UIController.board.style.transform =
                    `rotateX(${Math.random() * 40 - 20}deg) rotateY(${Math.random() * 40 - 20}deg)`;
                setTimeout(() => {
                    UIController.board.style.transform = "rotateX(10deg)";
                }, 1200);
                break;
        }
    }

    /**
     * Process a game outcome — update UI, Firebase leaderboard, and analytics.
     * @param {"X"|"O"|"draw"|null} outcome
     * @returns {boolean} true if game ended
     */
    function _handleOutcome(outcome) {
        if (!outcome) return false;

        UIController.updateScores(GameState.scores);

        if (outcome === "draw") {
            UIController.setStatus("Quantum Entanglement — It's a Draw!");
            UIController.logEvent("A stalemate in the spacetime continuum.");
            _trackEvent("game_draw", "gameplay", "draw");
            FirebaseService.logAnalyticsEvent("game_draw");
        } else {
            const isHuman = outcome === PLAYER_X;
            UIController.setStatus(`System Alert: ${outcome} Wins!`);
            UIController.logEvent(
                isHuman ? "Humanity prevails… for now." : "System overridden. You lose."
            );

            // Highlight winning triplet
            for (const [a, b, c] of WINNING_CONDITIONS) {
                const b_ = GameState.board;
                if (b_[a] === outcome && b_[b] === outcome && b_[c] === outcome) {
                    UIController.highlightWinners([a, b, c]);
                    break;
                }
            }

            _trackEvent("game_end", "gameplay", isHuman ? "player_x_wins" : "ai_wins");
            FirebaseService.logAnalyticsEvent("game_end", { winner: outcome });

            // Submit to Firebase global leaderboard
            FirebaseService.submitScore({
                wins:        GameState.scores.X,
                gamesPlayed: GameState.gamesPlayed,
            }).catch(() => {/* graceful — leaderboard is non-critical */});

            // Increment global game counter in Firebase
            FirebaseService.incrementGlobalStats().catch(() => {});
        }

        UIController.setBoardInteractive(false);
        return true;
    }

    /** Reset game for a new round. */
    function resetGame() {
        GameState.reset();
        UIController.resetBoard();
        UIController.setStatus("Player X's Turn");
        UIController.logEvent("System rebooted. New sequence initialized.");
        UIController.setBoardInteractive(true);
        _trackEvent("game_reset", "gameplay", "new_game");
    }

    return { handlePlayerMove, computerTurn, resetGame };
})();


// ============================================================
// Keyboard Grid Navigation (WCAG 2.1 — roving tabindex)
// ============================================================

(function initKeyboardNav() {
    const cells = UIController.cells;

    cells.forEach((cell, index) => {
        cell.addEventListener("keydown", e => {
            let target = -1;

            switch (e.key) {
                case "ArrowRight": target = index + 1 <  9 ? index + 1 : index; break;
                case "ArrowLeft":  target = index - 1 >= 0 ? index - 1 : index; break;
                case "ArrowDown":  target = index + 3 <  9 ? index + 3 : index; break;
                case "ArrowUp":    target = index - 3 >= 0 ? index - 3 : index; break;
                case "Home":       target = 0; break;
                case "End":        target = 8; break;
            }

            if (target !== -1 && target !== index) {
                e.preventDefault();
                cells[index].setAttribute("tabindex", "-1");
                cells[target].setAttribute("tabindex",  "0");
                cells[target].focus();
            }

            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                GameController.handlePlayerMove(index);
            }
        });

        cell.addEventListener("click", () => GameController.handlePlayerMove(index));
    });

    UIController.resetBtn.addEventListener("click", () => {
        cells.forEach((c, i) => c.setAttribute("tabindex", i === 0 ? "0" : "-1"));
        GameController.resetGame();
    });
})();


// ============================================================
// Leaderboard — Firebase Realtime Database UI
// ============================================================

const Leaderboard = (() => {
    const _section   = document.getElementById("leaderboard-section");
    const _toggle    = UIController.toggleLbBtn;
    const _closeBtn  = document.getElementById("close-leaderboard-btn");
    const _loading   = document.getElementById("leaderboard-loading");
    const _table     = document.getElementById("leaderboard-table");
    const _rows      = document.getElementById("leaderboard-rows");
    const _empty     = document.getElementById("leaderboard-empty");

    let _unsubscribe = null;   // real-time listener cleanup

    /** Render leaderboard entries into the table. */
    function _renderEntries(entries) {
        _loading.classList.add("hidden");

        if (!entries || entries.length === 0) {
            _table.classList.add("hidden");
            _empty.classList.remove("hidden");
            return;
        }

        _empty.classList.add("hidden");
        _table.classList.remove("hidden");
        _rows.innerHTML = "";

        entries.slice(0, 10).forEach((entry, rank) => {
            const tr = document.createElement("tr");
            if (entry.id === FirebaseService.currentUid) {
                tr.classList.add("current-player");
                tr.setAttribute("aria-label", "Your entry");
            }

            const medal  = ["🥇", "🥈", "🥉"][rank] ?? `${rank + 1}`;
            const player = entry.id === FirebaseService.currentUid
                ? `${entry.player} (You)`
                : entry.player;

            tr.innerHTML = `
                <td>${medal}</td>
                <td>${_escapeHtml(player)}</td>
                <td>${entry.wins ?? 0}</td>
                <td>${entry.gamesPlayed ?? 0}</td>
                <td>${entry.winRate ?? 0}%</td>
            `;
            _rows.appendChild(tr);
        });
    }

    /** Safely escape user-provided content before inserting into DOM. */
    function _escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    /** Open the leaderboard panel and subscribe to live updates. */
    async function _open() {
        _section.classList.remove("hidden");
        _section.setAttribute("aria-hidden", "false");
        _toggle.setAttribute("aria-expanded", "true");
        _loading.classList.remove("hidden");
        _table.classList.add("hidden");
        _empty.classList.add("hidden");

        _trackEvent("leaderboard_open", "leaderboard", "open");
        FirebaseService.logAnalyticsEvent("leaderboard_opened");

        if (FirebaseService.isReady) {
            // Subscribe to live updates from Firebase Realtime Database
            _unsubscribe = FirebaseService.subscribeLeaderboard(_renderEntries, 10);
        } else {
            _loading.classList.add("hidden");
            _empty.classList.remove("hidden");
            _empty.textContent = "Firebase unavailable — connect Firebase to see global scores.";
        }
    }

    /** Close the leaderboard panel and stop the live listener. */
    function _close() {
        _section.classList.add("hidden");
        _section.setAttribute("aria-hidden", "true");
        _toggle.setAttribute("aria-expanded", "false");

        if (typeof _unsubscribe === "function") {
            _unsubscribe();
            _unsubscribe = null;
        }
    }

    _toggle.addEventListener("click", () => {
        _section.classList.contains("hidden") ? _open() : _close();
    });
    _closeBtn.addEventListener("click", _close);
    _section.addEventListener("keydown", e => { if (e.key === "Escape") _close(); });

    return { open: _open, close: _close };
})();


// ============================================================
// Terminal Emulator
// ============================================================

const Terminal = (() => {
    const _section  = document.getElementById("terminal-section");
    const _toggle   = UIController.toggleTermBtn;
    const _closeBtn = document.getElementById("close-terminal-btn");
    const _output   = document.getElementById("terminal-output");
    const _input    = document.getElementById("terminal-input");
    const _history  = [];
    let   _histIdx  = -1;

    function _appendLine(text, cls = "") {
        const div = document.createElement("div");
        div.className = `log-line ${cls}`.trim();
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

    function _toggleVisibility() {
        const isHidden = _section.classList.toggle("hidden");
        _section.setAttribute("aria-hidden", String(isHidden));
        _toggle.setAttribute("aria-expanded", String(!isHidden));
        if (!isHidden) {
            _input.focus();
            _trackEvent("terminal_open", "terminal", "toggle");
        }
    }

    async function _submit(cmd) {
        _appendLine(`quantum@cloud:~$ ${cmd}`, "user-cmd");
        _history.unshift(cmd);
        _histIdx = -1;

        if (cmd.toLowerCase() === "clear" || cmd.toLowerCase() === "cls") {
            _clearOutput();
            return;
        }

        _appendLine("Processing…", "system-msg");
        _trackEvent("terminal_command", "terminal", cmd.split(" ")[0]);
        FirebaseService.logAnalyticsEvent("terminal_command", { command: cmd.split(" ")[0] });

        try {
            const response = await fetch("/run_command", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ command: cmd }),
                signal:  AbortSignal.timeout(8000),
            });

            _output.removeChild(_output.lastChild);   // remove "Processing…"

            const data = await response.json();

            if (data.stdout === "__CLEAR__") { _clearOutput(); return; }
            if (data.stdout)  data.stdout.split("\n").forEach(l => _appendLine(l));
            if (data.stderr)  _appendLine(`⚠ ${data.stderr}`, "error-msg");

            if (response.status === 403) _appendLine("🔒 Command blocked by security sandbox.", "error-msg");
            if (response.status === 429) _appendLine("⏱ Rate limit reached. Please wait.", "error-msg");

        } catch (err) {
            _output.removeChild(_output.lastChild);
            _appendLine(
                err.name === "TimeoutError"
                    ? "⏱ Request timed out (8s)."
                    : "🔌 Connection error. Is the server running?",
                "error-msg"
            );
        }
    }

    _toggle.addEventListener("click", _toggleVisibility);
    _closeBtn.addEventListener("click", _toggleVisibility);
    _section.addEventListener("keydown", e => { if (e.key === "Escape") _toggleVisibility(); });

    _input.addEventListener("keydown", async e => {
        const cmd = _input.value.trim();

        if (e.key === "Enter" && cmd) {
            _input.value = "";
            await _submit(cmd);
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            _histIdx = Math.min(_histIdx + 1, _history.length - 1);
            _input.value = _history[_histIdx] || "";
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            _histIdx = Math.max(_histIdx - 1, -1);
            _input.value = _histIdx >= 0 ? _history[_histIdx] : "";
        }
    });
})();


// ============================================================
// Firebase Initialisation (runs after DOM + SDK ready)
// ============================================================

(async function bootstrapFirebase() {
    UIController.setFirebaseStatus("connecting");

    const ok = await FirebaseService.init();

    if (ok) {
        UIController.setFirebaseStatus("connected");
        FirebaseService.logAnalyticsEvent("app_loaded", {
            platform:  "google_cloud_run",
            timestamp: Date.now(),
        });
    } else {
        UIController.setFirebaseStatus("disconnected");
    }
})();


// ============================================================
// Analytics helper (graceful if gtag not available)
// ============================================================

function _trackEvent(action, category, label) {
    if (typeof gtag === "function") {
        gtag("event", action, { event_category: category, event_label: label });
    }
}
