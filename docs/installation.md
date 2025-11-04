# Installation

## 1. Install Bun

### macOS/Linux

```bash
curl -fsSL https://bun.sh/install | bash
```

### Windows

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

## 2. Install Package

Now, we can install `agent-exporter` from npm or from source.

### Option 1: Install from npm

```bash
bun install -g agent-exporter
```

### Option 2: Install from source

```bash
git clone https://github.com/ihatenodejs/agent-exporter.git
cd agent-exporter
bun install
bun run build
bun link
```

## 3. Run

You should now have the `agent-exporter` command available.

```bash
agent-exporter --version
```
