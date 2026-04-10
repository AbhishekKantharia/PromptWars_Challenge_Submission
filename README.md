# Quantum Tic-Tac-Toe

A dynamic, interactive evolution of the classic game featuring unpredictable mechanics and an embedded Windows-style command prompt emulator, deployable to the cloud.

---

## Chosen Vertical
**Interactive Entertainment & DevOps Education**

This project targets the intersection of recreational web gaming and interactive sandbox tools. It is specifically designed for developers, cloud engineers, and tech enthusiasts who enjoy blending classic casual gameplay with live, containerized command-line environments. It bridges the gap between frontend web-development and backend systems management.

## Approach and Logic
The logic departs from a standard static UI by integrating dynamic mechanical surprises and a literal "CMD Override". 

1. **Dynamic Frontend Mechanics**: Standard Tic-Tac-Toe mechanics are implemented but stylized using modern Web APIs (CSS variables, dynamic DOM manipulation via JavaScript) to create a futuristic "Quantum" feel.
2. **Integrated Terminal Emulator**: The frontend provides a sleek, hidden terminal overlay which intercepts user commands and posts them to our underlying API.
3. **Backend Command Execution**: A lightweight Python HTTP server (`app.py`) processes the incoming JSON request, securely shells out to `cmd.exe` (on Windows) or `/bin/sh` (on Linux) via the `subprocess` module, and captures the absolute `stdout`/`stderr`.
4. **Containerization**: The entire application is packaged locally using Docker, ensuring that the backend execution environment is predictable and isolated, allowing for flawless deployment to services like Google Cloud Run.

## How the Solution Works
1. **The Game Interface**: Built with raw HTML/CSS/Vanilla JS (no external frameworks). Players interact with the grid while system events and anomalies are logged to an on-screen console.
2. **Terminal Override (CMD)**: A user clicks `CMD OVERRIDE` to open the terminal panel, providing a `C:\>` prompt that mimics the Windows Command Prompt. 
3. **Python Server API**: When a user hits Enter in the terminal, an asynchronous `fetch` request is sent to the `/run_command` endpoint. 
4. **Environment Execution (`app.py`)**: Our custom `http.server` implementation parses the payload, executes the command natively via the underlying OS shell, and reflects the exact execution output back into the DOM of the frontend terminal window in real-time.
5. **Hosting/Deployment**: The included `Dockerfile` packages both the python server and the static files together, binding statically to the necessary `$PORT` variables required by serverless container platforms.

## Assumptions Made
1. **Isolated Execution Environment**: Running arbitrary terminal commands directly from a web UI poses significant local system security risks. Therefore, it is assumed this application is executed strictly within an isolated network or an ephemeral container (such as Google Cloud Run or a local Docker sandbox) to prevent destructive behavior.
2. **Stateless Commands**: Since each terminal request runs via an independent shell invocation (e.g., `cmd.exe /c [command]`), we assume the user understands that shell state (like changing directories via `cd`) does not persist between individual execution requests.
3. **Browser Compatibility**: The frontend interface expects modern browser standards, relying on ES6 JavaScript (`async/await`) and modern CSS features (Flexbox, CSS Variables, pseudo-elements) to render the terminal animations correctly.
