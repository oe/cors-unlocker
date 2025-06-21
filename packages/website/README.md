# CORS Unlocker - Documentation Website

The official documentation and demo website for CORS Unlocker, built with Astro and modern web technologies.

## 🌐 Live Site

**Website**: [cors.forth.ink](https://cors.forth.ink)

## ✨ Features

- **📖 Complete Documentation** - API reference, guides, and tutorials
- **🎮 Interactive Playground** - Test CORS functionality live
- **🎨 Modern Design** - Responsive, accessible, and fast
- **🔍 SEO Optimized** - Built for search engine visibility
- **⚡ Lightning Fast** - Static site generation with Astro
- **📱 Mobile Friendly** - Optimized for all devices

## 🏗️ Architecture

### Tech Stack
- **Framework**: [Astro](https://astro.build/) - Static Site Generator
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- **Components**: React components for interactive elements
- **Content**: MDX for documentation with embedded components
- **Icons**: [Lucide React](https://lucide.dev/) - Beautiful icon set
- **Deployment**: Static hosting (Netlify/Vercel)

### Site Structure
```
website/
├── src/
│   ├── pages/              # Site pages and routing
│   │   ├── index.astro     # Homepage
│   │   ├── docs.mdx        # Documentation
│   │   ├── playground.astro # Interactive demo
│   │   ├── faq.mdx         # FAQ page
│   │   └── privacy.mdx     # Privacy policy
│   ├── components/         # Reusable components
│   │   ├── base-layout.astro    # Main layout
│   │   ├── hero.astro           # Hero section
│   │   ├── playground/          # Interactive demo components
│   │   └── features/            # Feature showcase
│   ├── routes/             # API routes for messaging
│   └── styles/             # Global styles
├── public/                 # Static assets
└── astro.config.ts        # Astro configuration
```

## 🚀 Development

### Prerequisites
- Node.js 18+
- pnpm (recommended)

### Setup
```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

### Development Scripts
```bash
# Development
pnpm dev              # Start dev server with hot reload
pnpm predev           # Pre-development setup (builds NPM package)

# Building
pnpm build            # Build for production
pnpm preview          # Preview production build locally
```

### Environment Setup
The website runs on `http://localhost:4321` during development and integrates with the browser extension for live demonstrations.

## 📋 Content Management

### Documentation (MDX)
Documentation is written in MDX format, allowing:
- **Markdown Content**: Standard markdown for text content
- **React Components**: Embedded interactive components
- **Code Examples**: Syntax-highlighted code blocks
- **Live Demos**: Working examples with the extension

### Component System
- **Layout Components**: Consistent page structure
- **Content Components**: Specialized content blocks
- **Interactive Components**: Playground and demos
- **Utility Components**: Buttons, badges, and UI elements

### Adding New Content
1. **Documentation**: Add MDX files to `src/pages/`
2. **Components**: Create reusable components in `src/components/`
3. **Styles**: Extend Tailwind configuration or add custom CSS
4. **Assets**: Place static files in `public/`

## 🎮 Interactive Features

### CORS Playground
The playground allows users to:
- **Test Extension**: Verify CORS Unlocker is installed and working
- **Make Requests**: Send real HTTP requests with CORS enabled/disabled
- **See Results**: View response data and error handling
- **Try Examples**: Pre-configured request examples
- **cURL Support**: Import and test cURL commands

### Extension Integration
The website communicates with the browser extension through:
- **Message Passing**: Secure communication via browser APIs
- **Status Detection**: Real-time extension status checking
- **Live Control**: Enable/disable CORS directly from the playground
- **Error Handling**: Graceful fallbacks when extension not available

## 🎨 Design System

### Color Palette
```css
/* Primary Colors */
--primary-blue: #2563eb;    /* Main brand color */
--primary-green: #10b981;   /* Success states */
--primary-orange: #f59e0b;  /* Warning states */

/* Neutral Colors */
--gray-50: #f8fafc;         /* Light backgrounds */
--gray-900: #0f172a;        /* Dark text */
```

### Typography
- **Headings**: Inter font with varied weights
- **Body Text**: System font stack for optimal readability
- **Code**: JetBrains Mono for code blocks and technical content

### Components
- **Buttons**: Consistent styling with hover/focus states
- **Cards**: Content containers with shadows and borders
- **Code Blocks**: Syntax highlighting with copy functionality
- **Forms**: Accessible input components

## 🔗 Routing & Pages

### Main Pages
- **`/`** - Homepage with hero and feature overview
- **`/docs`** - Complete documentation and API reference
- **`/playground`** - Interactive CORS testing environment
- **`/faq`** - Frequently asked questions
- **`/privacy`** - Privacy policy and data handling

### API Routes
- **`/api/message`** - Bridge endpoint for extension communication
- **Dynamic routing** for content organization

## 🌐 SEO & Performance

### Search Engine Optimization
- **Meta Tags**: Comprehensive meta descriptions and keywords
- **Open Graph**: Social media sharing optimization
- **Structured Data**: Schema markup for rich snippets
- **Sitemap**: Automatic sitemap generation

### Performance Features
- **Static Generation**: Fast loading with pre-built pages
- **Image Optimization**: Automatic image compression and formats
- **Code Splitting**: Minimal JavaScript bundles
- **Caching**: Optimized caching strategies

### Accessibility
- **Semantic HTML**: Proper heading structure and landmarks
- **Keyboard Navigation**: Full keyboard accessibility
- **Screen Readers**: ARIA labels and descriptions
- **Color Contrast**: WCAG AA compliant color schemes

## 🚀 Deployment

### Build Process
```bash
# Production build
pnpm build

# Generated files in dist/
├── index.html              # Homepage
├── docs/index.html         # Documentation
├── playground/index.html   # Interactive demo
└── _astro/                 # Optimized assets
```

### Hosting Options
- **Netlify**: Recommended for automatic deployments
- **Vercel**: Excellent performance and edge functions
- **GitHub Pages**: Free hosting for open source projects
- **Cloudflare Pages**: Fast global CDN

### Environment Variables
```bash
# Optional configuration
PUBLIC_SITE_URL=https://cors.forth.ink
PUBLIC_EXTENSION_ID=your-extension-id
```

## 🔧 Configuration

### Astro Configuration
```typescript
// astro.config.ts
export default defineConfig({
  site: 'https://cors.forth.ink',
  integrations: [
    react(),           // React component support
    tailwind(),        // Tailwind CSS integration
    mdx()             // MDX content support
  ]
});
```

### Tailwind Configuration
Custom configuration extends the default Tailwind setup with:
- **Brand Colors**: CORS Unlocker color palette
- **Custom Fonts**: Typography system
- **Component Classes**: Reusable utility combinations

## 📊 Analytics & Monitoring

### Performance Monitoring
- **Lighthouse Scores**: Regular performance auditing
- **Core Web Vitals**: Optimization for user experience metrics
- **Bundle Analysis**: JavaScript bundle size monitoring

### User Analytics (Optional)
Privacy-focused analytics options:
- **Plausible**: Privacy-friendly web analytics
- **Simple Analytics**: Minimal tracking
- **No Tracking**: Fully privacy-focused option

## 🔒 Privacy & Security

### Data Handling
- **No Personal Data**: Website doesn't collect personal information
- **Local Storage**: Minimal use for user preferences
- **No Cookies**: Cookie-free browsing experience
- **External Links**: Clear indication of external resources

### Security Measures
- **HTTPS Only**: Secure connection enforcement
- **CSP Headers**: Content Security Policy implementation
- **No Inline Scripts**: Secure script loading practices
- **Dependency Auditing**: Regular security updates

## 📄 License

MIT License - see [LICENSE](../../LICENSE) file for details.

## 🤝 Contributing

### Content Contributions
- **Documentation**: Improve guides and API references
- **Examples**: Add practical use cases and code samples
- **Translations**: Help localize content for global users

### Development Contributions
- **Bug Fixes**: Resolve issues with site functionality
- **Features**: Add new interactive components or pages
- **Performance**: Optimize loading times and user experience

See the main [DEVELOPMENT.md](../../DEVELOPMENT.md) for detailed contribution guidelines.

---

**Building the bridge between developers and seamless CORS management.**
