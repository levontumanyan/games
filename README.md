# Games

A collection of self-hosted, real-time web games and apps built with FastAPI and vanilla JavaScript.

# Available Apps

+--------------------+------------+-----------------------------------+-----------------------------------+
| Application        | Local Port | Local Development URL             | Remote Production URL             |
+--------------------+------------+-----------------------------------+-----------------------------------+
| **Spelling Bee**   | `8765`     | `http://localhost:8765/spelling/` | `https://levon.ajwest.ca/spelling/`|
| **Workout Player** | `8766`     | `http://localhost:8766/workout/`  | `https://levon.ajwest.ca/workout/` |
+--------------------+------------+-----------------------------------+-----------------------------------+

# Local Development

Start the apps from the root directory using the Makefile:

## Start Workout App
```bash
make dev-workout
```
Opens on [http://localhost:8766/workout/](http://localhost:8766/workout/) with hot-reloading.

## Start Spelling Bee
```bash
make dev-spelling
```
Opens on [http://localhost:8765/spelling/](http://localhost:8765/spelling/) with hot-reloading.

## Quality Checks & Testing
```bash
make check      # Run linting, formatting checks, and test suites
make lint       # Run Ruff lint and format verification
make format     # Auto-format and auto-fix code with Ruff
make test       # Run pytest across all test suites
```

## Stop Local Servers
```bash
make stop
```

# Deployment

Pushing to `main` automatically runs dependencies check via `uv sync` and restarts the systemd services on `levon-box` via the git post-receive hook:

```bash
git push origin main
```
