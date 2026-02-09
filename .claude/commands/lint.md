---
allowed-tools: Bash(pnpm run lint), Bash(pnpm run lint:fix)
description: Run linting checks
---

Run linting to check code quality:

!`pnpm run lint`

Automatically fix all linting issues:
1. First run `pnpm run lint:fix` to auto-fix all fixable issues
2. If any issues remain that cannot be auto-fixed, manually fix them by editing the affected files