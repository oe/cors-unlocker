# CORS Unlocker

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Available-green)](https://chrome.google.com/webstore)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox-Available-orange)](https://addons.mozilla.org)
[![npm version](https://img.shields.io/npm/v/cors-unlocker.svg)](https://www.npmjs.com/package/cors-unlocker)

**🚀 Instantly unlock CORS restrictions for seamless API testing and cross-origin development**

[🌐 Website](https://cors.forth.ink) | [📖 Documentation](https://cors.forth.ink) | [📦 NPM Package](https://www.npmjs.com/package/cors-unlocker)

</div>

## ✨ Features

- **🔓 One-Click CORS Unlock** - Enable/disable CORS restrictions with a single click
- **🎯 Smart Credentials Support** - Automatically handles authentication headers
- **⚡ Zero Configuration** - Works out of the box, no setup required
- **🪶 Lightweight & Fast** - Minimal impact on browser performance
- **🛠️ Developer-Friendly** - Built by developers, for developers
- **📦 NPM Integration** - Programmatic CORS management for your applications
- **🌐 Cross-Browser Support** - Chrome, Firefox, and Edge compatible
- **🔒 Privacy-First** - No data collection, works entirely locally

## 🚀 Quick Start

### Browser Extension

1. **Install from Store:**
   - [Chrome Web Store](https://chrome.google.com/webstore) 
   - [Firefox Add-ons](https://addons.mozilla.org)
   - [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons)

2. **Enable CORS:**
   - Click the CORS Unlocker icon in your browser toolbar
   - Toggle CORS for the current tab
   - Make your cross-origin requests without restrictions

### NPM Package

```bash
npm install cors-unlocker
```

```javascript
import { enable, disable, isExtInstalled } from 'cors-unlocker';

// Check if extension is installed
const installed = await isExtInstalled();

// Enable CORS for current page
await enable();

// Enable with credentials support
await enable({ credentials: true });

// Disable CORS
await disable();
```

## 🏗️ Project Structure

This is a monorepo containing multiple packages:

```
cors-unlocker/
├── packages/
│   ├── browser-extension/     # Browser extension (Chrome, Firefox, Edge)
│   ├── npm/                   # NPM package for developers
│   └── website/               # Documentation and demo website
├── docs/                      # Additional documentation
└── README.md                  # This file
```

## 📦 Packages

### Browser Extension
Cross-browser extension that enables CORS bypass functionality:
- **Chrome/Edge**: Uses `declarativeNetRequest` API
- **Firefox**: Content script bridge for external communication
- **Features**: Popup interface, settings page, tab-specific control

### NPM Package (`cors-unlocker`)
Lightweight JavaScript package for programmatic CORS management:
- **Size**: ~1.7KB gzipped
- **Formats**: ES modules and UMD
- **TypeScript**: Full type definitions included
- **Browser Support**: Chrome, Firefox, Edge

### Website
Documentation and demo site built with Astro:
- **Live Demo**: Interactive CORS testing interface
- **Documentation**: Complete API reference and guides
- **Playground**: Test the extension functionality

## 🛠️ Development

### Prerequisites
- Node.js 18+
- pnpm (recommended) or npm

### Setup
```bash
# Clone the repository
git clone https://github.com/yourusername/cors-unlocker.git
cd cors-unlocker

# Install dependencies
pnpm install

# Start development servers
pnpm dev
```

### Build
```bash
# Build all packages
pnpm build

# Build specific package (from root)
pnpm dev:extension          # Extension development
pnpm dev:website            # Website development  
pnpm dev:cors-unlocker      # NPM package development
```

### Package Scripts
```bash
# Development
pnpm dev                    # Start all dev servers
pnpm dev:extension          # Extension development only
pnpm dev:website            # Website development only
pnpm dev:cors-unlocker      # NPM package development

# Building
pnpm build                  # Build all packages
```

## 🎯 Use Cases

### API Testing & Development
```javascript
// Perfect for testing APIs during development
await enable({ credentials: true });
const response = await fetch('https://api.example.com/data');
```

### Cross-Origin Integration
```javascript
// Seamless third-party service integration
await enable();
const result = await fetch('https://third-party-api.com/endpoint');
```

### Automated Testing
```javascript
// Include in your test setup
beforeEach(async () => {
  if (await isExtInstalled()) {
    await enable();
  }
});
```

## 🔒 Privacy & Security

- **Local Operation**: All functionality works entirely in your browser
- **No Data Collection**: We don't collect, store, or transmit any user data
- **Tab-Specific**: Only affects tabs where you explicitly enable CORS
- **Open Source**: Fully transparent and auditable code
- **Secure by Default**: Automatically disables when not needed

## 📋 Browser Support

| Browser | Extension | NPM Package |
|---------|-----------|-------------|
| Chrome  | ✅        | ✅          |
| Firefox | ✅        | ✅          |
| Edge    | ✅        | ✅          |
| Safari  | ❌        | ❌          |

## 📖 Documentation

- **[Getting Started](https://cors.forth.ink/docs)** - Quick setup guide
- **[API Reference](https://cors.forth.ink/docs)** - Complete API documentation
- **[Examples](https://cors.forth.ink/playground)** - Common use cases and examples
- **[FAQ](https://cors.forth.ink/faq)** - Common questions and answers

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](DEVELOPMENT.md) for details.

### Development Workflow
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Vite](https://vitejs.dev/) and [TypeScript](https://www.typescriptlang.org/)
- UI components powered by [React](https://reactjs.org/) and [Tailwind CSS](https://tailwindcss.com/)
- Icons from [Lucide](https://lucide.dev/)
- Website built with [Astro](https://astro.build/)

## 📞 Support

- **Documentation**: [cors.forth.ink](https://cors.forth.ink)
- **Issues**: [GitHub Issues](https://github.com/yourusername/cors-unlocker/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/cors-unlocker/discussions)

---

<div align="center">

**⭐ Star this repository if CORS Unlocker helps your development workflow!**

Made with ❤️ by developers, for developers.

</div>
