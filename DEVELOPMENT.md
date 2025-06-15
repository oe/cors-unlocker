# Development Guide

## Development Commands

### Parallel Development (Recommended)

Run both extension and website development servers simultaneously:

```bash
# Start both extension watch mode and website dev server in parallel
pnpm dev
```

This will:
- Start the browser extension in watch mode (`vite build --watch`)
- Start the website development server (`astro dev`)
- Both processes run independently and won't block each other

### Individual Development

If you want to work on specific parts of the project:

```bash
# Only browser extension development
pnpm dev:extension

# Only website development  
pnpm dev:website
```

### What Each Command Does

| Command | Package | Description |
|---------|---------|-------------|
| `pnpm dev` | All | Runs extension + website in parallel |
| `pnpm dev:extension` | browser-extension | Builds extension with file watching |
| `pnpm dev:website` | website | Starts Astro dev server on http://localhost:4321 |

### Development Workflow

1. **Start development**: `pnpm dev`
2. **Browser extension**:
   - Files are built to `packages/browser-extension/dist/`
   - Load the extension in Chrome from the `dist/chrome/` folder
   - Changes trigger automatic rebuilds
3. **Website**:
   - Available at http://localhost:4321
   - Hot reload is enabled for instant updates

### Stopping Development

- Press `Ctrl+C` to stop all processes
- Turbo will gracefully shut down both the extension watcher and website server

### Notes

- The `persistent: true` setting in turbo.json ensures both dev servers run indefinitely
- Both processes output logs to the same terminal with package prefixes
- No manual coordination needed - turbo handles the parallel execution
