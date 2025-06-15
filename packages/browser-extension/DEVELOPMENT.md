# Development Guide

## Sourcemap Support

This project is configured with comprehensive sourcemap support for better debugging experience during development.

### Development Scripts

- `pnpm dev` - Build extension in development mode with watch mode and sourcemaps
- `pnpm dev:serve` - Start Vite dev server (for component development)  
- `pnpm build` - Build production version with inline sourcemaps

### Automatic Environment Detection

The Vite configuration automatically detects the environment using Vite's built-in methods:
- `command === 'serve'` or `mode === 'development'` → Development mode
- `mode === 'production'` → Production mode

No need to manually set NODE_ENV variables.

### Sourcemap Configuration

- **Development mode**: External sourcemap files (`.map`) for better debugging
- **Production mode**: Inline sourcemaps (smaller bundle, no external files)
- **CSS sourcemaps**: Enabled for development
- **Function names**: Preserved in development builds
- **Code minification**: Disabled in development, enabled in production

### Using Sourcemaps in Browser DevTools

1. Load the development build of the extension
2. Open DevTools in any page where the extension is active
3. Navigate to Sources tab
4. You should see the original TypeScript/React source files
5. Set breakpoints and debug as usual

### Tips for Better Debugging

- Use the `dev` script for extension development (builds with watch mode)
- Use the `dev:serve` script for component development in isolation
- Source maps work in both popup and content script contexts
- Function names are preserved in development builds for better stack traces
