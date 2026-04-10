const board = document.getElementById('board');
const cells = document.querySelectorAll('.cell');
const status = document.getElementById('status');
const resetBtn = document.getElementById('reset-btn');
const eventLog = document.querySelector('.event-log p');

const terminalSection = document.getElementById('terminal-section');
const toggleTerminalBtn = document.getElementById('toggle-terminal-btn');
const closeTerminalBtn = document.getElementById('close-terminal-btn');
const terminalInput = document.getElementById('terminal-input');
const terminalOutput = document.getElementById('terminal-output');

let gameState = ['', '', '', '', '', '', '', '', ''];
let gameActive = true;

const WINNING_CONDITIONS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

// Chaos triggers
const CHAOS_MESSAGES = [
    "Quantum fluctuation detected. Swapping cells.",
    "System overridden. The computer demands more space.",
    "An anomaly wiped a sector clean.",
    "Reality shifting... recalculating logic.",
    "Glitch in the matrix. Extra turn granted to AI."
];

function logEvent(msg) {
    eventLog.textContent = msg;
    eventLog.style.animation = 'none';
    eventLog.offsetHeight; // trigger reflow
    eventLog.style.animation = 'type 0.5s steps(40, end)';
}

function handleCellClick(e) {
    const clickedCell = e.target;
    const clickedCellIndex = parseInt(clickedCell.getAttribute('data-index'));

    if (gameState[clickedCellIndex] !== '' || !gameActive) {
        // Quantum anomaly: sometimes you can overwrite!
        if (Math.random() < 0.1 && gameActive && gameState[clickedCellIndex] === 'O') {
            logEvent("QUANTUM OVERWRITE! You hacked a cell.");
            clickedCell.classList.add('glitch');
            setTimeout(() => clickedCell.classList.remove('glitch'), 500);
        } else {
            return;
        }
    }

    makeMove(clickedCell, clickedCellIndex, 'X');
    checkResult();

    if (gameActive) {
        status.innerText = "System Calculating...";
        setTimeout(computerMove, 600 + Math.random() * 800);
    }
}

function makeMove(cell, index, player) {
    gameState[index] = player;
    cell.innerText = player;
    cell.classList.remove('x', 'o');
    cell.classList.add(player.toLowerCase());
}

function computerMove() {
    if (!gameActive) return;

    // Trigger unexpected chaos? (20% chance)
    if (Math.random() < 0.2) {
        triggerChaos();
        return; // Will recurse or do something else
    }

    // Normal move
    let emptyCells = gameState.map((val, idx) => val === '' ? idx : null).filter(val => val !== null);
    
    if (emptyCells.length === 0) return;

    // Simple AI: block player or pick random
    let moveIndex = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    
    let cell = document.querySelector(`[data-index="${moveIndex}"]`);
    makeMove(cell, moveIndex, 'O');
    
    status.innerText = "Player X's Turn";
    checkResult();
}

function triggerChaos() {
    let emptyCells = gameState.map((val, idx) => val === '' ? idx : null).filter(val => val !== null);
    let oCells = gameState.map((val, idx) => val === 'O' ? idx : null).filter(val => val !== null);
    let xCells = gameState.map((val, idx) => val === 'X' ? idx : null).filter(val => val !== null);

    const chaosType = Math.floor(Math.random() * 4);
    logEvent(CHAOS_MESSAGES[Math.floor(Math.random() * CHAOS_MESSAGES.length)]);

    switch(chaosType) {
        case 0: // Wipe a player's cell
            if (xCells.length > 0) {
                let target = xCells[Math.floor(Math.random() * xCells.length)];
                gameState[target] = '';
                cells[target].innerText = '';
                cells[target].className = 'cell glitch';
                setTimeout(() => cells[target].classList.remove('glitch'), 500);
            }
            break;
        case 1: // Swap X and O somewhere
            if (xCells.length > 0 && oCells.length > 0) {
                let xT = xCells[Math.floor(Math.random() * xCells.length)];
                let oT = oCells[Math.floor(Math.random() * oCells.length)];
                gameState[xT] = 'O';
                gameState[oT] = 'X';
                cells[xT].innerText = 'O';
                cells[oT].innerText = 'X';
                cells[xT].className = 'cell o glitch';
                cells[oT].className = 'cell x glitch';
                setTimeout(() => {
                    cells[xT].classList.remove('glitch');
                    cells[oT].classList.remove('glitch');
                }, 500);
            }
            break;
        case 2: // AI places two pieces if empty cells > 1
            if (emptyCells.length > 1) {
                for(let i=0; i<2; i++) {
                    let move = emptyCells[Math.floor(Math.random() * emptyCells.length)];
                    makeMove(document.querySelector(`[data-index="${move}"]`), move, 'O');
                    emptyCells = emptyCells.filter(v => v !== move); // remove used
                }
            }
            break;
        case 3: // Re-render the entire board position purely for visual chaos
            board.style.transform = `rotateX(${Math.random()*40 - 20}deg) rotateY(${Math.random()*40 - 20}deg)`;
            break;
    }

    status.innerText = "Player X's Turn";
    checkResult();
}

function checkResult() {
    let roundWon = false;
    let winningPlayer = '';

    for (let i = 0; i <= 7; i++) {
        const winCondition = WINNING_CONDITIONS[i];
        let a = gameState[winCondition[0]];
        let b = gameState[winCondition[1]];
        let c = gameState[winCondition[2]];

        if (a === '' || b === '' || c === '') {
            continue;
        }
        if (a === b && b === c) {
            roundWon = true;
            winningPlayer = a;
            break;
        }
    }

    if (roundWon) {
        status.innerText = `System Alert: ${winningPlayer} Wins!`;
        logEvent(winningPlayer === 'X' ? "Humanity prevails... for now." : "System overridden. You lose.");
        gameActive = false;
        return;
    }

    let roundDraw = !gameState.includes('');
    if (roundDraw) {
        status.innerText = 'Quantum Entanglement (Draw)';
        logEvent("A stalemate in the spacetime continuum.");
        gameActive = false;
        return;
    }
}

function resetGame() {
    gameActive = true;
    gameState = ['', '', '', '', '', '', '', '', ''];
    status.innerText = "Player X's Turn";
    logEvent("System reboted. New run sequence initialized.");
    cells.forEach(cell => {
        cell.innerText = '';
        cell.className = 'cell';
    });
    board.style.transform = `rotateX(10deg)`;
}

cells.forEach(cell => cell.addEventListener('click', handleCellClick));
resetBtn.addEventListener('click', resetGame);

// --- TERMINAL LOGIC ---

toggleTerminalBtn.addEventListener('click', () => {
    terminalSection.classList.toggle('hidden');
    if (!terminalSection.classList.contains('hidden')) {
        terminalInput.focus();
    }
});

closeTerminalBtn.addEventListener('click', () => {
    terminalSection.classList.add('hidden');
});

function appendToTerminal(text, className) {
    const div = document.createElement('div');
    div.className = `log-line ${className}`;
    div.textContent = text;
    terminalOutput.appendChild(div);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

terminalInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const cmd = terminalInput.value.trim();
        if (!cmd) return;
        
        appendToTerminal(`C:\\> ${cmd}`, 'user-cmd');
        terminalInput.value = '';

        if (cmd.toLowerCase() === 'clear' || cmd.toLowerCase() === 'cls') {
            terminalOutput.innerHTML = '';
            appendToTerminal(`Microsoft Windows [Version 10.0]`, 'system-msg');
            appendToTerminal(`(c) Microsoft Corporation. All rights reserved.`, 'system-msg');
            return;
        }

        try {
            // Send payload to our python backend
            const response = await fetch('/run_command', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ command: cmd })
            });

            const data = await response.json();
            
            if (data.stdout) {
                appendToTerminal(data.stdout, '');
            }
            if (data.stderr) {
                appendToTerminal(data.stderr, 'error-msg');
            }
            if (data.error) {
                appendToTerminal(`Backend Error: ${data.error}`, 'error-msg');
            }

        } catch (error) {
            appendToTerminal(`Connection error. Is the Python backend running?`, 'error-msg');
        }
    }
});
