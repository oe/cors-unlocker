# CORS Unlocker - Project Architecture Documentation

## 📋 **Project Overview**

CORS Unlocker is a browser extension that enables cross-origin requests during development by modifying HTTP response headers. It eliminates the need for proxy servers, reducing infrastructure costs for developers calling third-party APIs.

### **Key Value Propositions**
- 🚀 One-click CORS activation for any domain
- 💰 Zero server costs - eliminates proxy server expenses
- 🛡️ Local processing with privacy protection
- 🎛️ Smart rule management with auto-cleanup
- 📦 NPM package for seamless project integration

## 🏗️ **Architecture Overview**

```
cors-unlocker/
├── packages/
│   ├── browser-extension/     # Browser extension core
│   │   ├── src/
│   │   │   ├── background/    # Service worker & CORS logic
│   │   │   ├── popup/         # Extension popup UI
│   │   │   ├── options/       # Settings page
│   │   │   └── types/         # TypeScript definitions
│   │   └── dist/             # Built extension files
│   │
│   ├── npm/          # NPM package for integration
│   │   ├── src/
│   │   │   ├── detector.ts   # Extension detection
│   │   │   └── installer.ts  # User guidance
│   │   └── dist/
│   │
│   └── website/              # Landing page & documentation
│       ├── src/
│       │   ├── components/   # Astro components
│       │   ├── pages/        # Website pages
│       │   └── content/      # Documentation content
│       └── dist/
```

## 🔧 **Core Components**

### **1. Browser Extension**

#### **Background Service Worker**
- **File**: background
- **Purpose**: Handle CORS header modification using declarativeNetRequest API
- **Key Features**:
  - Dynamic rule creation and management
  - Credential-aware header configuration
  - Smart caching strategies

#### **Rule Management System**
```typescript
interface IRuleItem {
  id: number;
  domain: string;
  origin: string;
  credentials: boolean;
  extraHeaders?: string;  // Custom headers (comma-separated)
  disabled: boolean;
  updatedAt: number;
}
```

#### **CORS Header Strategy**
- **Non-credentials mode**: Use wildcards (`*`) for maximum compatibility
- **Credentials mode**: Explicit header lists with custom header support
- **Cache management**: Different cache durations based on credentials mode

### **2. Popup Interface**
- **File**: popup
- **Purpose**: Domain-specific CORS toggle and configuration
- **Features**:
  - One-click enable/disable for current domain
  - Credentials mode toggle
  - Custom header management with tag-based input

### **3. Options/Settings Page**
- **File**: options
- **Purpose**: Bulk rule management and advanced settings
- **Features**:
  - Rule list with bulk operations
  - Auto-cleanup configuration
  - Export/import functionality
  - Custom header management with intelligent validation

## 🎯 **Technical Implementation**

### **CORS Header Configuration**

#### **Credentials Mode (credentials: true)**
```http
Access-Control-Allow-Origin: https://specific-domain.com
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD
Access-Control-Allow-Headers: [preset headers] + [custom headers]
Access-Control-Max-Age: 300
```

#### **Non-Credentials Mode (credentials: false)**
```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD
Access-Control-Allow-Headers: *
Access-Control-Max-Age: 3600
```

### **Preset CORS Headers**
```typescript
export const PRESET_CORS_HEADERS = [
  'Accept', 'Accept-Language', 'Content-Language', 'Content-Type',
  'Authorization', 'X-Requested-With', 'Origin', 'Referer',
  'X-API-Key', 'X-Auth-Token', 'X-CSRF-Token', 'X-Client-Version',
  'X-Request-ID', 'X-Custom-Header', 'Cache-Control', 'X-Forwarded-For'
];
```

### **Custom Header Management**
- **Storage**: String format with comma separation
- **Validation**: Case-insensitive duplicate detection
- **UI**: Tag-based input with space/comma triggers
- **Integration**: Automatic merging with preset headers

## 🌐 **Website & Documentation**

### **Tech Stack**
- **Framework**: Astro.js for static site generation
- **Styling**: Tailwind CSS with custom design system
- **Components**: Mix of Astro and React components for interactive features

### **Key Pages**
- **Homepage**: Value proposition and quick start
- **Playground**: Interactive CORS testing environment
- **Integration**: NPM package documentation
- **FAQ**: Common questions and troubleshooting
- **Privacy**: Data handling and privacy policy

### **Playground Component**
- **Purpose**: Allow users to test CORS requests
- **Features**:
  - HTTP method selection (GET, POST, PUT, DELETE, PATCH)
  - Custom headers configuration
  - Real-time request/response display
  - CORS error demonstration

## 🔌 **NPM Package Integration**

### **Extension Detection**
```typescript
// Detect if CORS Unlocker is installed
const isExtensionInstalled = await detectCORSUnlocker();

if (!isExtensionInstalled) {
  // Guide user through installation
  showInstallationGuide();
}
```

### **Usage in Projects**
```javascript
import { detectCORSUnlocker, showInstallGuide } from 'cors-unlocker';

// Check before making CORS requests
if (!(await detectCORSUnlocker())) {
  showInstallGuide({
    domain: window.location.hostname,
    apiEndpoint: 'https://api.example.com'
  });
}
```

## 🛡️ **Security & Privacy**

### **Data Handling**
- **Local Storage**: All rules stored locally on user device
- **No External Transmission**: No user data sent to external servers
- **Minimal Permissions**: Only necessary browser permissions requested

### **Permission Justifications**
- **declarativeNetRequest**: Core CORS header modification
- **activeTab**: Current tab domain detection
- **storage**: Local rule persistence
- **host_permissions**: Apply rules to user-enabled domains only

## 📱 **Browser Support**

### **Supported Browsers**
- ✅ Chrome (Manifest V3)
- ✅ Edge (Chromium-based)
- ✅ Firefox (Manifest V2/V3)

### **Limitations**
- ❌ Safari (extension API limitations)
- ❌ Mobile browsers (no extension support)
- ⚠️ Requires 2xx status codes for preflight requests

## 🚀 **Development Setup**

### **Prerequisites**
- Node.js 18+
- pnpm package manager
- Chrome/Firefox for extension testing

### **Quick Start**
```bash
# Install dependencies
pnpm install

# Build extension
cd packages/browser-extension
pnpm build

# Load unpacked extension in Chrome
# Navigate to chrome://extensions/
# Enable "Developer mode"
# Click "Load unpacked" and select dist/chrome folder

# Start website development
cd packages/website
pnpm dev
```

### **Project Scripts**
```bash
# Extension development
pnpm build:extension      # Build for all browsers
pnpm build:chrome        # Chrome-specific build
pnpm build:firefox       # Firefox-specific build

# Website development
pnpm dev:website         # Start dev server
pnpm build:website       # Build for production

# NPM package
pnpm build:npm           # Build NPM package
pnpm test:npm            # Run package tests
```

## 🎯 **Use Cases & Target Audience**

### **Primary Use Cases**
- **Internal Company Tools**: Bypass CORS for admin panels and dashboards
- **API Prototyping**: Test third-party APIs without backend setup
- **Educational Projects**: Learn web development without infrastructure complexity
- **Startup MVPs**: Build with zero infrastructure costs

### **Target Developers**
- Frontend developers testing APIs
- Full-stack developers in early development phases
- Students learning web development
- Startup founders building MVPs

## 🔄 **Deployment & Distribution**

### **Extension Distribution**
- **Chrome Web Store**: Primary distribution channel
- **Firefox Add-ons**: Secondary distribution
- **GitHub Releases**: Direct download for advanced users

### **Website Hosting**
- **Static Hosting**: Netlify/Vercel for fast global delivery
- **Domain**: cors-unlocker.forth.ink
- **CDN**: Automatic via hosting provider

## 📈 **Future Enhancements**

### **Planned Features**
- Enhanced rule import/export
- Team collaboration features
- Advanced debugging tools
- Integration with popular development frameworks

### **Technical Improvements**
- Better error handling and user feedback
- Performance optimizations
- Extended browser compatibility
- Enhanced security measures

## 🤝 **Contributing**

The project is open source and welcomes contributions:
- **GitHub**: https://github.com/oe/cors-unlocker
- **Issues**: Bug reports and feature requests
- **Pull Requests**: Code contributions welcome
- **Documentation**: Help improve docs and examples

This architecture provides a solid foundation for understanding and contributing to the CORS Unlocker project while maintaining flexibility for future enhancements.