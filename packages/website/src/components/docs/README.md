# Documentation Component Library

This folder contains all specialized components for documentation pages, used to maintain consistent documentation styling and simplify MDX maintenance.

## 📁 Component List

Currently available documentation components (10 total):
- `InfoCard.astro` - Information cards with multiple type support
- `Callout.astro` - Left-bordered warning/tip boxes
- `Quote.astro` - Quote/reference component
- `CompareCards.astro` - Left-right comparison cards
- `FeatureGrid.astro` - Feature grid layout
- `StepCards.astro` - Step cards
- `ApiMethod.astro` - API method documentation
- `CodeBlock.astro` - Code blocks
- `ButtonGroup.astro` - Button groups
- `Badge.astro` - Badges

## Available Components

### 🎨 Content Display Components

#### `InfoCard.astro`
Information cards with support for different types of highlighting
```mdx
<InfoCard type="success" title="Success Notice">
Content text
</InfoCard>
```

#### `Callout.astro`
Left-bordered warning/tip boxes
```mdx
<Callout type="warning" title="Notice">
Important tip content
</Callout>
```

#### `Quote.astro`
Quote/reference component
```mdx
<Quote type="note" author="Author" source="Source">
Quote content
</Quote>
```

### 📊 Layout Components

#### `CompareCards.astro`
Left-right comparison cards
```mdx
<CompareCards leftTitle="✅ Recommended Practices" rightTitle="❌ Avoid These">
<div slot="left">Recommended content</div>
<div slot="right">Content to avoid</div>
</CompareCards>
```

#### `FeatureGrid.astro`
Feature grid layout
```mdx
<FeatureGrid columns={2} title="Feature List">
<div class="feature-item">
  <span class="feature-item-icon">🎯</span>
  <h4 class="feature-item-title">Feature Title</h4>
  <p class="feature-item-desc">Feature description</p>
</div>
</FeatureGrid>
```

#### `StepCards.astro`
Step cards
```mdx
<StepCards>
<div slot="step1">First step content</div>
<div slot="step2">Second step content</div>
</StepCards>
```

### 🔧 API Documentation Components

#### `ApiMethod.astro`
API method documentation
```mdx
<ApiMethod
  name="methodName()"
  description="Method description"
  parameters={[
    { name: "param1", type: "string", required: true, description: "Parameter description" }
  ]}
  returnType="Promise<void>"
  example="Code example"
/>
```

#### `CodeBlock.astro`
Code blocks
```mdx
<CodeBlock title="Example Code" language="typescript" fileName="example.ts">
Code content
</CodeBlock>
```

### 🎯 Interactive Components

#### `ButtonGroup.astro`
Button groups
```mdx
<ButtonGroup 
  title="Actions" 
  buttons={[
    { text: "Primary Button", href: "/link", type: "primary" },
    { text: "Secondary Button", href: "/link", type: "secondary" }
  ]} 
/>
```

#### `Badge.astro`
Badges
```mdx
<Badge variant="success" size="sm">Badge Text</Badge>
```

## Usage

Import the required components in MDX files:

```mdx
---
layout: '../components/doc-layout.astro'
title: Page Title
---

import InfoCard from '../components/docs/InfoCard.astro';
import Callout from '../components/docs/Callout.astro';
import ApiMethod from '../components/docs/ApiMethod.astro';
// ... other components

## Content

<InfoCard type="info" title="Tip">
Use components to make documentation more beautiful and readable!
</InfoCard>
```

## Design Principles

1. **Consistency**: All components follow a unified design system
2. **Semantic**: Component names clearly express their purpose
3. **Simplicity**: Reduce HTML tags in MDX
4. **Maintainability**: Centralized management of styles and behavior
5. **Apple Style**: Modern and clean visual design
