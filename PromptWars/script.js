const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const overlayTitle = document.getElementById('overlay-title');
const overlayDesc = document.getElementById('overlay-desc');
const effectDisplay = document.getElementById('effect-display');

const GRID_SIZE = 20;
const TILE_COUNT = canvas.width / GRID_SIZE; // 600 / 20 = 30

const COLORS = {
    snake: '#0ea5e9',      // primary light blue
    snakeHead: '#0284c7',  // slightly darker blue for head
    food: '#10b981',       // emerald green
    mysteryFood: '#d946ef',// fuchsia pink
    wall: '#ef4444',       // bright red
    portal: '#8b5cf6'      // violet
};

let snake = [];
let velocity = { x: 0, y: 0 };
let food = { x: 15, y: 15 };
let mysteryFood = null;
let walls = [];
let portals = [];

// Game state variables
let score = 0;
let highScore = localStorage.getItem('snakeHighScore') || 0;
highScoreEl.innerText = highScore;

let gameLoop;
let isGameOver = false;
let gameStarted = false;
let standardSpeed = 100;
let currentSpeed = standardSpeed;

// Active unexpected effects
let activeEffect = null; // 'confusion', 'hyper', 'none'
let effectTimeout = null;

const EFFECTS = ['confusion', 'hyper', 'gluttony'];

// Input Handling
let changingDirection = false;

document.addEventListener('keydown', handleInput);
startBtn.addEventListener('click', initGame);

function handleInput(e) {
    if ((e.key === ' ' || e.key === 'Enter') && (isGameOver || !gameStarted)) {
        initGame();
        return;
    }
    
    if (!gameStarted || isGameOver) return;
    if (changingDirection) return;

    let key = e.key.toLowerCase();
    
    let isUp = key === 'w' || key === 'arrowup';
    let isDown = key === 's' || key === 'arrowdown';
    let isLeft = key === 'a' || key === 'arrowleft';
    let isRight = key === 'd' || key === 'arrowright';
    
    if (activeEffect === 'confusion') {
        // Reverse controls!
        let tempUp = isUp, tempDown = isDown, tempLeft = isLeft, tempRight = isRight;
        isUp = tempDown;
        isDown = tempUp;
        isLeft = tempRight;
        isRight = tempLeft;
    }

    if (isUp && velocity.y !== 1) { velocity = { x: 0, y: -1 }; changingDirection = true; }
    if (isDown && velocity.y !== -1) { velocity = { x: 0, y: 1 }; changingDirection = true; }
    if (isLeft && velocity.x !== 1) { velocity = { x: -1, y: 0 }; changingDirection = true; }
    if (isRight && velocity.x !== -1) { velocity = { x: 1, y: 0 }; changingDirection = true; }
}

function initGame() {
    snake = [
        { x: 15, y: 15 },
        { x: 15, y: 16 },
        { x: 15, y: 17 }
    ];
    velocity = { x: 0, y: -1 }; // Start moving up
    score = 0;
    scoreEl.innerText = score;
    isGameOver = false;
    gameStarted = true;
    walls = [];
    portals = [];
    mysteryFood = null;
    clearEffect();
    overlay.classList.add('hidden');
    spawnItem('food');
    gameLoop = setTimeout(update, standardSpeed);
}

function update() {
    if (isGameOver) return;

    changingDirection = false;
    moveSnake();
    checkCollisions();
    
    if (!isGameOver) {
        clearCanvas();
        drawEntities();
        gameLoop = setTimeout(update, currentSpeed);
        
        // Randomly spawn portals or mystery food occasionally
        rollUnexpectedEvents();
    }
}

function moveSnake() {
    const head = { x: snake[0].x + velocity.x, y: snake[0].y + velocity.y };
    
    // Portal teleport logic
    if (portals.length === 2) {
        if (head.x === portals[0].x && head.y === portals[0].y) {
            head.x = portals[1].x;
            head.y = portals[1].y;
            // Eject from the second portal
            head.x += velocity.x;
            head.y += velocity.y;
        } else if (head.x === portals[1].x && head.y === portals[1].y) {
            head.x = portals[0].x;
            head.y = portals[0].y;
            head.x += velocity.x;
            head.y += velocity.y;
        }
    }

    snake.unshift(head); // Add new head

    // Check food consumption
    if (head.x === food.x && head.y === food.y) {
        score += 10;
        scoreEl.innerText = score;
        spawnItem('food');
        if (score % 50 === 0) spawnHurdle(); // Every 50 score, spawn a wall
        standardSpeed = Math.max(50, 100 - Math.floor(score/30) * 5); // Slowly increase base speed
        if (activeEffect !== 'hyper') {
            currentSpeed = standardSpeed;
        }
    } else if (mysteryFood && head.x === mysteryFood.x && head.y === mysteryFood.y) {
        score += 25;
        scoreEl.innerText = score;
        triggerMysteryEffect();
        mysteryFood = null;
        snake.pop(); // doesn't grow directly, but handled by effects
    } else {
        snake.pop(); // remove tail
    }
}

function checkCollisions() {
    const head = snake[0];

    // Wall collision (edges)
    if (head.x < 0 || head.x >= TILE_COUNT || head.y < 0 || head.y >= TILE_COUNT) {
        gameOver("CRASHED INTO THE BOUNDARY");
    }

    // Self collision
    for (let i = 1; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            gameOver("SYSTEM OVERLOAD (SELF-COLLISION)");
        }
    }

    // Hurdle block collision
    for (let w of walls) {
        if (head.x === w.x && head.y === w.y) {
            gameOver("FIREWALL INTERCEPTED");
        }
    }
}

function gameOver(reason) {
    isGameOver = true;
    clearTimeout(gameLoop);
    clearEffect();
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('snakeHighScore', highScore);
        highScoreEl.innerText = highScore;
    }
    overlayTitle.innerText = "SYSTEM FAILURE";
    overlayTitle.style.color = COLORS.wall;
    overlayTitle.style.textShadow = "none";
    overlayDesc.innerText = reason;
    startBtn.innerText = "REBOOT SYSTEM";
    overlay.classList.remove('hidden');
}

function triggerMysteryEffect() {
    const effect = EFFECTS[Math.floor(Math.random() * EFFECTS.length)];
    clearEffect();
    
    activeEffect = effect;
    effectDisplay.classList.remove('hidden');
    effectDisplay.className = 'effect-display effect-' + effect;
    
    if (effect === 'confusion') {
        effectDisplay.innerText = "WARNING: CONTROLS REVERSED!";
    } else if (effect === 'hyper') {
        effectDisplay.innerText = "OVERCLOCK: HYPER-SPEED!";
        currentSpeed = 40; // very fast
    } else if (effect === 'gluttony') {
        effectDisplay.innerText = "GLUTTONY: SHORTENED!";
        // Chop snake in half minimum length 3
        let newLen = Math.max(3, Math.floor(snake.length / 2));
        snake.length = newLen;
        setTimeout(clearEffect, 1500); // clear UI fast
        return; // Gluttony is instantaneous
    }
    
    effectTimeout = setTimeout(clearEffect, 8000); // Effects last 8 seconds
}

function clearEffect() {
    if (effectTimeout) clearTimeout(effectTimeout);
    activeEffect = null;
    currentSpeed = standardSpeed;
    effectDisplay.classList.add('hidden');
    effectDisplay.className = 'effect-display hidden';
    effectDisplay.innerText = "NORMAL";
}

function drawRect(x, y, color, expand = 0, isGlow = true) {
    const pX = x * GRID_SIZE - expand;
    const pY = y * GRID_SIZE - expand;
    const s = GRID_SIZE + expand * 2;
    
    if(isGlow) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = color; // keep a soft shadow for popping out
    } else {
        ctx.shadowBlur = 0;
    }
    ctx.fillStyle = color;
    ctx.fillRect(pX, pY, s, s);
    // Soft Grid border suitable for light mode
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.shadowBlur = 0;
    ctx.strokeRect(pX, pY, s, s);
}

function drawEntities() {
    // Portals
    if (portals.length === 2) {
        let pulse = Math.abs(Math.sin(Date.now() / 200)) * 2;
        drawRect(portals[0].x, portals[0].y, COLORS.portal, pulse, true);
        drawRect(portals[1].x, portals[1].y, COLORS.portal, pulse, true);
    }

    // Walls
    for (let w of walls) {
        drawRect(w.x, w.y, COLORS.wall, 0, true);
    }

    // Snake Tail
    for (let i = 1; i < snake.length; i++) {
        let opacity = 1 - (i / snake.length) * 0.6; // Fade out towards tail
        ctx.fillStyle = activeEffect === 'hyper' ? COLORS.mysteryFood : COLORS.snake;
        ctx.globalAlpha = opacity;
        ctx.shadowBlur = 5;
        ctx.shadowColor = ctx.fillStyle;
        ctx.fillRect(snake[i].x * GRID_SIZE + 1, snake[i].y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2);
    }
    ctx.globalAlpha = 1.0;

    // Snake Head
    drawRect(snake[0].x, snake[0].y, COLORS.snakeHead, 1, true);

    // Food
    drawRect(food.x, food.y, COLORS.food, 1, true);

    // Mystery Food
    if (mysteryFood) {
        let blink = Math.floor(Date.now() / 150) % 2 === 0;
        if(blink) drawRect(mysteryFood.x, mysteryFood.y, COLORS.mysteryFood, 2, true);
    }
}

function clearCanvas() {
    ctx.fillStyle = '#ffffff'; // clean white background inside canvas for light mode
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function rollUnexpectedEvents() {
    // 2% chance every tick to spawn mystery food if none exists
    if (!mysteryFood && Math.random() < 0.02) {
        spawnItem('mysteryFood');
    }
    // 1% chance to spawn or move portals
    if (score >= 40 && portals.length === 0 && Math.random() < 0.01) {
        portals = [getRandomEmptyPos(), getRandomEmptyPos()];
        // Disappear after 15 seconds
        setTimeout(() => { portals = []; }, 15000);
    }
}

function spawnItem(type) {
    const pos = getRandomEmptyPos();
    if (type === 'food') food = pos;
    if (type === 'mysteryFood') {
        mysteryFood = pos;
        // Mystery food disappears after 10 seconds if not eaten
        setTimeout(() => {
            if (mysteryFood && mysteryFood.x === pos.x && mysteryFood.y === pos.y) {
                mysteryFood = null;
            }
        }, 10000);
    }
}

function spawnHurdle() {
    // max 10 walls
    if (walls.length < 10) {
        walls.push(getRandomEmptyPos());
    }
}

function getRandomEmptyPos() {
    let x, y, safe;
    while (true) {
        x = Math.floor(Math.random() * TILE_COUNT);
        y = Math.floor(Math.random() * TILE_COUNT);
        safe = true;

        for (let s of snake) if (s.x === x && s.y === y) safe = false;
        if (food.x === x && food.y === y) safe = false;
        if (mysteryFood && mysteryFood.x === x && mysteryFood.y === y) safe = false;
        for (let w of walls) if (w.x === x && w.y === y) safe = false;
        for (let p of portals) if (p.x === x && p.y === y) safe = false;
        
        // Block spawning directly in front of face
        if (snake.length > 0 && x === snake[0].x + velocity.x && y === snake[0].y + velocity.y) safe = false;

        if (safe) return { x, y };
    }
}

// Initial draw Call to setup the board visually
clearCanvas();
