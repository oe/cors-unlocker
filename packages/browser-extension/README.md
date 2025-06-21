# CORS Unlocker - Browser Extension

A lightweight, developer-friendly browser extension that instantly unlocks CORS restrictions for seamless API testing and cross-origin development.

## ✨ Features

- **🔓 One-Click CORS Control** - Toggle CORS restrictions with a single click
- **🎯 Smart Credentials Support** - Automatic authentication header handling
- **🪶 Lightweight Design** - Minimal performance impact
- **🌐 Cross-Browser Support** - Chrome, Firefox, and Edge compatible
- **🛠️ Developer Tools** - Advanced settings and debugging options
- **🔒 Privacy-First** - No data collection, works entirely locally
- **⚡ Tab-Specific Control** - Enable/disable per tab as needed

## 🚀 Installation

### From Browser Stores
- **Chrome**: [Chrome Web Store](https://chrome.google.com/webstore)
- **Firefox**: [Firefox Add-ons](https://addons.mozilla.org)
- **Edge**: [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons)

### Manual Installation (Development)
1. Clone the repository and build the extension
2. Open browser extension management page
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist/chrome` or `dist/firefox` folder

## 🎯 How to Use

### Basic Usage
1. **Install** the extension from your browser's store
2. **Click** the CORS Unlocker icon in your toolbar
3. **Toggle** CORS for the current tab
4. **Make** your cross-origin requests without restrictions
5. **Disable** when finished to maintain security

### Advanced Features
- **Settings Page**: Access via the settings button in the popup
- **Credentials Support**: Enable authentication headers when needed
- **Rule Management**: Create and manage CORS rules for specific origins
- **Debug Mode**: Enable detailed logging for troubleshooting (development only)

## 🛠️ Development

### Prerequisites
- Node.js 18+
- pnpm (recommended)

### Setup
```bash
# Install dependencies
pnpm install

# Start development server
# will run chrome by default, change `TARGET` to "firefox" in dev script for Firefox
pnpm dev

# Build for production
pnpm build

# Build specific browser
pnpm build:chrome   # Chrome/Edge
pnpm build:firefox  # Firefox
```

### Development Scripts
```bash
# Development with watch mode
pnpm dev            # Start dev server with hot reload (Firefox by default)
pnpm dev:serve      # Start dev server for component development

# Building
pnpm build          # Build all browser versions
pnpm build:chrome   # Build Chrome/Edge version only
pnpm build:firefox  # Build Firefox version only
```

### Project Structure
```
browser-extension/
├── src/
│   ├── background/         # Background script (service worker)
│   ├── content/           # Content scripts (Firefox bridge)
│   ├── popup/             # Extension popup interface
│   ├── options/           # Settings page
│   ├── common/            # Shared utilities and components
│   └── manifest.json      # Extension manifest template
├── public/                # Static assets (icons, locales)
├── dist/                  # Built extension files
└── scripts/               # Build and post-build scripts
```

### Architecture

#### Chrome/Edge Implementation
- **Background Script**: Uses `declarativeNetRequest` API for CORS header manipulation
- **Popup Interface**: React-based UI for quick CORS control
- **Options Page**: Comprehensive settings and rule management

#### Firefox Implementation
- **Content Script Bridge**: Enables external website communication
- **Background Script**: Handles CORS rule management
- **Message Passing**: Secure communication between contexts

### Key Technologies
- **Build Tool**: Vite with TypeScript
- **UI Framework**: React with Tailwind CSS
- **Browser APIs**: WebExtensions API with Polyfill
- **Packaging**: Multi-browser build system

## 🔧 Configuration

### Default Settings
- **Default Credentials**: Disabled (can be changed in settings)
- **Max Rules**: 100 rules per extension
- **Auto-cleanup**: 30 days for disabled rules
- **Debug Mode**: Available only in development builds

### Manifest Configuration
The extension uses Manifest V3 with conditional compilation for different browsers:
- **Chrome/Edge**: Uses `externally_connectable` for website communication
- **Firefox**: Uses content scripts for cross-origin messaging

### Build Configuration
- **Development**: Includes source maps, debug features, localhost permissions
- **Production**: Optimized builds, no debug features, filtered localhost access

## 🔒 Privacy & Security

### Privacy Principles
- **No Data Collection**: Extension doesn't collect or transmit user data
- **Local Operation**: All processing happens in your browser
- **No Analytics**: No tracking or usage analytics
- **Open Source**: Code is fully transparent and auditable

### Security Features
- **Tab-Specific**: CORS bypass only affects explicitly enabled tabs
- **Auto-Disable**: Automatically disables when tab is closed
- **Permission Minimal**: Only requests necessary browser permissions
- **Secure Defaults**: CORS disabled by default for security

### Permissions Explained
- **declarativeNetRequest**: Modify HTTP headers for CORS bypass
- **tabs**: Monitor active tab changes for automatic rule application
- **storage**: Save user preferences and CORS rules locally
- **host_permissions**: Access all URLs (required for CORS modification)

## 🐛 Troubleshooting

### Common Issues

**Extension not working:**
- Ensure the extension is enabled in browser settings
- Check if CORS is enabled for the current tab
- Refresh the page after enabling CORS

**Still getting CORS errors:**
- Verify the request includes proper headers
- Check if credentials support is needed
- Try enabling debug mode (development only)

**Settings not saving:**
- Check browser storage permissions
- Clear browser cache and try again
- Reinstall the extension if issues persist

### Debug Mode (Development Only)
Enable debug mode in settings for detailed logging:
- Background script operations
- Message passing between contexts
- CORS rule application details
- Network request modifications

### Getting Help
- **Documentation**: [cors.forth.ink](https://cors.forth.ink)
- **Issues**: Report bugs on GitHub
- **Discussions**: Community support on GitHub Discussions

## 📋 Browser Compatibility

| Feature | Chrome 88+ | Firefox 85+ | Edge 88+ |
|---------|------------|-------------|----------|
| Basic CORS Bypass | ✅ | ✅ | ✅ |
| Credentials Support | ✅ | ✅ | ✅ |
| External Messaging | ✅ | ✅ | ✅ |
| Settings Sync | ✅ | ✅ | ✅ |

## 🔄 Release Process

### Version Management
- **Major**: Breaking changes or significant new features
- **Minor**: New features, backward compatible
- **Patch**: Bug fixes and small improvements

### Building for Release
```bash
# Build production versions
pnpm build

# Generated files
dist/chrome/    # Chrome/Edge extension
dist/firefox/   # Firefox extension
```

### Store Submission
Each browser store has specific requirements:
- **Chrome**: Zip the `dist/chrome` folder
- **Firefox**: Zip the `dist/firefox` folder
- **Edge**: Same as Chrome, uses Chrome Web Store package

## 📄 License

MIT License - see [LICENSE](../../LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please see the main [DEVELOPMENT.md](../../DEVELOPMENT.md) guide for:
- Development setup
- Code style guidelines
- Pull request process
- Testing requirements

---

**Built with ❤️ for developers who need reliable CORS management.**
