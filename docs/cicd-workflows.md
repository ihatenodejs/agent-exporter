# CI/CD Workflows

This document describes the GitHub Actions workflows used in Agent Exporter for continuous integration, testing, and deployment.

## Overview

Agent Exporter uses GitHub Actions for automated quality checks, releases, and npm publishing. All workflows run on Ubuntu latest with Node.js 24 and Bun for package management.

## Workflows

### Quality Checks (`quality-checks.yml`)

**Triggers:**

- Push to `main` or version branches (`v*`)
- Pull requests

**Steps:**

1. Checkout repository
2. Setup Node.js 24 and Bun
3. Install dependencies
4. Run quality checks:
   - ESLint linting
   - Prettier format checking
   - TypeScript type checking
   - Unit tests
5. Build the project

This workflow ensures code quality and prevents broken code from being merged.

### Create Release Tag (`create-tag.yml`)

**Triggers:**

- Push to `main` branch (excluding release commits)

**Steps:**

1. Checkout repository with full history
2. Setup Node.js 24 and Bun
3. Install dependencies
4. Run quality checks (same as above)
5. Build the project
6. Create and push version tag based on `package.json` version

**Logic:**

- Extracts version from `package.json`
- Skips if tag already exists
- Creates tag `v{version}` and pushes to origin

This workflow automatically creates version tags when code is merged to main.

### Create GitHub Release (`create-release.yml`)

**Triggers:**

- Push to version tags (`v*`)
- Manual workflow dispatch

**Steps:**

1. Checkout repository with full history
2. Setup Node.js 24 and Bun
3. Install dependencies
4. Run quality checks
5. Build the project
6. Create GitHub release with compiled binary

**Logic:**

- Extracts version from `package.json`
- Skips if tag already exists
- Creates GitHub release with:
  - Auto-generated release notes
  - Latest release flag
  - Compiled binary from `dist/agent-exporter`

This workflow creates GitHub releases containing the compiled executable.

### Publish to npm (`publish.yml`)

**Triggers:**

- GitHub release publication

**Steps:**

1. Checkout repository
2. Setup Node.js 24 and Bun
3. Install dependencies
4. Run quality checks
5. Build the project
6. Check if version exists on npm
7. Publish to npm if new version

**Logic:**

- Checks if version already exists on npm
- Only publishes if version is new
- Uses `NPM_TOKEN` secret for authentication

This workflow publishes the package to npm when a GitHub release is created.

## Release Process

The automated release process follows these steps:

1. **Development**: Code is pushed to feature branches
2. **Quality Check**: `quality-checks.yml` runs on PRs
3. **Merge**: Code is merged to `main`
4. **Tag Creation**: `create-tag.yml` creates version tag
5. **Release**: `create-release.yml` creates GitHub release
6. **Publish**: `publish.yml` publishes to npm

## Required Secrets

- `NPM_TOKEN`: npm authentication token for publishing

## Environment

All workflows use:

- **Runner**: `ubuntu-latest`
- **Node.js**: Version 24
- **Bun**: Latest version
- **Permissions**: Appropriate for each workflow's needs

## Quality Check Standards

All workflows include these quality checks:

- **ESLint**: Code linting with project configuration
- **Prettier**: Code formatting verification
- **TypeScript**: Type checking without emission
- **Tests**: Unit test execution
- **Build**: Project compilation verification
