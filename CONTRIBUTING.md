# Contributing to ProxiSpeak

Thank you for your interest in contributing to **ProxiSpeak**! 🎉

This document outlines the process for contributing code, reporting issues, and proposing new features. By participating in this project, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## Table of Contents
1. [Getting Started](#getting-started)
2. [How to Contribute](#how-to-contribute)
   - [Reporting Bugs](#reporting-bugs)
   - [Suggesting Features](#suggesting-features)
   - [Submitting Code](#submitting-code)
3. [Branching Strategy](#branching-strategy)
4. [Commit Message Guidelines](#commit-message-guidelines)
5. [Pull Request Process](#pull-request-process)
6. [Code Style](#code-style)
7. [Development Setup](#development-setup)

---

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/ProxiSpeak---Geospatial-Proximity-Audio-Ecosystem.git
   ```
3. **Add upstream** remote:
   ```bash
   git remote add upstream https://github.com/Dvij-Joshi/ProxiSpeak---Geospatial-Proximity-Audio-Ecosystem.git
   ```
4. **Install dependencies** for both server and client:
   ```bash
   cd server && npm install
   cd ../client && npm install
   ```
5. **Copy environment file:**
   ```bash
   cp .env.example .env
   ```

---

## How to Contribute

### Reporting Bugs

Before creating a bug report, please check if the issue already exists. When submitting a bug report, include:

- **Clear title** — summarize the problem in one sentence
- **Steps to reproduce** — numbered list of exact steps
- **Expected behavior** — what you expected to happen
- **Actual behavior** — what actually happened
- **Environment** — OS, Node.js version, browser, and version
- **Screenshots or logs** — if applicable

Use the **Bug Report** issue template.

---

### Suggesting Features

Feature requests are welcome! Please open an issue using the **Feature Request** template and include:

- **Use case** — why this feature would be valuable
- **Proposed solution** — how you envision it working
- **Alternatives considered** — other approaches you thought of

---

### Submitting Code

1. **Create a branch** from `main` (or `branch-dvij` for development features):
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** — keep commits atomic and focused

3. **Test your changes** — ensure nothing is broken

4. **Commit using Conventional Commits** (see below)

5. **Push your branch:**
   ```bash
   git push origin feat/your-feature-name
   ```

6. **Open a Pull Request** against `main`

---

## Branching Strategy

| Branch | Purpose |
|---|---|
| `main` | Stable, production-ready code + documentation |
| `branch-dvij` | Primary development branch |
| `feat/<name>` | New feature development |
| `fix/<name>` | Bug fixes |
| `docs/<name>` | Documentation-only changes |
| `refactor/<name>` | Code refactoring without behavior change |

---

## Commit Message Guidelines

We follow the **Conventional Commits** specification.

### Format
```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

### Types

| Type | When to Use |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes only |
| `style` | Formatting, missing semicolons, etc. (no logic change) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `chore` | Build process, dependency updates, config changes |
| `perf` | Performance improvements |

### Scopes

| Scope | Description |
|---|---|
| `backend` | Node.js/Express server |
| `frontend` | React client |
| `socket` | Socket.io signaling |
| `geo` | Geospatial / MongoDB logic |
| `audio` | Web Audio API / spatial mixing |
| `webrtc` | WebRTC peer connections |
| `canvas` | HTML5 Canvas rendering |
| `db` | Database schema or migrations |

### Examples
```
feat(socket): add proximity-update event with earshot filtering
fix(audio): correct stereo panning formula for negative deltaX
docs(api): add ice-candidate event documentation
chore(deps): upgrade socket.io to 4.7.2
perf(canvas): throttle avatar re-render to 60 FPS with RAF
```

---

## Pull Request Process

1. Ensure your branch is up to date with `main`:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. Ensure your code follows the [Code Style](#code-style) guidelines

3. Write a clear PR description:
   - **What** changes were made
   - **Why** they were made
   - **How** to test them
   - Link any related issues with `Closes #123`

4. Request a review from at least **1 maintainer**

5. PRs will be merged using **Squash and Merge** to keep history clean

---

## Code Style

### JavaScript / Node.js
- Use **ES Modules** (`import`/`export`) throughout
- Use `async/await` over raw Promises
- Use `const` by default; `let` only when reassignment is needed
- Meaningful variable names — no single-letter vars except loop counters
- Max line length: **100 characters**

### React
- Functional components with hooks only (no class components)
- One component per file
- Props destructured in the function signature
- Use `PropTypes` or JSDoc for prop documentation

### General
- No `console.log` in production code — use a logger (e.g., `morgan`, `winston`)
- Handle all Promise rejections and async errors
- Comments for complex logic blocks

---

## Development Setup

### Environment Variables

See `.env.example` for all required variables. At minimum:

```env
MONGODB_URI=mongodb://localhost:27017/proxispeak
PORT=5000
CLIENT_URL=http://localhost:5173
```

### Running in Development Mode

```bash
# Terminal 1 — Backend
cd server
npm run dev      # Uses nodemon for hot-reload

# Terminal 2 — Frontend
cd client
npm run dev      # Vite dev server with HMR
```

### Running Tests (when available)

```bash
cd server
npm test

cd client
npm test
```

---

Thank you for contributing to ProxiSpeak! Every PR, bug report, and suggestion helps make the virtual office better for everyone. 🏢🎙️
