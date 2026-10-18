# Installation

## 1. Prerequisites (Install Bun)

`agent-exporter` requires the [Bun](https://bun.sh) runtime (>=1.3.14) on all supported operating systems (macOS, Linux, and Windows). **Node.js alone is insufficient**, as the CLI utilizes Bun runtime APIs and Bun's built-in SQLite engine.

### macOS/Linux

```bash
curl -fsSL https://bun.sh/install | bash
```

### Windows

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

## 2. Install Package

You can install `agent-exporter` from npm, from source, or via standalone release binaries on supported platforms.

### Option 1: Install from npm (Bun Runtime Source Execution)

The npm package distributes portable TypeScript sources executed directly under Bun via the `#!/usr/bin/env bun` entrypoint across macOS, Linux, and Windows:

```bash
bun install -g agent-exporter
```

> **Note:** If installed through `npm install -g agent-exporter`, Bun must still be installed and present on your `PATH`. Node.js alone cannot execute the package.

### Option 2: Install from Source (Host-Targeted Build)

Source builds compile a native standalone binary targeting your current host operating system and architecture:

```bash
git clone https://github.com/ihatenodejs/agent-exporter.git
cd agent-exporter
bun install --frozen-lockfile
bun run build
bun link
```

The build command (`bun run build`) compiles the standalone executable at `dist/agent-exporter`. Running `bun run start` executes this binary and requires a prior build step.

### Option 3: Standalone GitHub Release Binaries (Ubuntu Host-Specific)

Precompiled standalone binary assets attached to GitHub Releases are built in CI on Ubuntu (`ubuntu-latest`). These release binaries are Ubuntu host-specific and are **not** portable to or advertised for macOS or Windows. Users on macOS or Windows must install via npm (using Bun) or compile from source.

## 3. Run

You should now have the `agent-exporter` command available:

```bash
agent-exporter --version
```

## Platform Portability and Verification Status

Package packaging and execution have been verified locally on macOS using the installed-package smoke workflow (`bun run package:smoke`). A multi-platform CI matrix covering `ubuntu-latest`, `macos-latest`, and `windows-latest` has been added to `.github/workflows/quality-checks.yml`. However, live Ubuntu and Windows runner verification evidence has not yet been recorded in this environment, and contributors lack authorization to push or trigger release workflows. Full cross-platform portability across all three operating systems is therefore not claimed as proven until CI matrix results are verified across all platforms.
