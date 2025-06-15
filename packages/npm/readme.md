# cors-unlocker

`cors-unlocker` is a utility to manage Cross-Origin Resource Sharing (CORS) settings for your browser. It allows you to enable or disable CORS for specific websites, making API testing and development easier.

## Installation

To install the package, use npm or yarn:

```sh
npm install cors-unlocker -S
# or
yarn add cors-unlocker
```

## How it works

This npm package provides a series of methods that communicate with the browser extension "Browser App CORS" through the webpage "https://cors.forth.ink/message/index.html". When CORS is enabled, this extension modifies all responses to requests sent from the current page by adding the header `Access-Control-Allow-Origin` (default value is `*`). By setting `credentials` to `true`, the header value will be the origin of the current page, allowing CORS with credentials (e.g., fetch with `credentials: include`).

## Usage & API

### Check if the Extension is Installed

```typescript
import appCors from 'cors-unlocker';

try {
  const isInstalled = await appCors.isExtInstalled();
  console.log('Extension installed:', isInstalled);
} catch (error) {
  console.error('Failed to check extension status:', error.message);
}
```

**Returns:** `Promise<boolean>`
**Throws:** `AppCorsError` when there's an error communicating with the extension infrastructure

### Check if CORS is Enabled

```typescript
try {
  const status = await appCors.isEnabled();
  console.log('CORS status:', status);
} catch (error) {
  console.error('Failed to check CORS status:', error.message);
  console.error('Error type:', error.type);
}
```

**Returns:** `Promise<{ enabled: boolean, credentials: boolean }>`

**Throws:** `AppCorsError` with specific error types:
- `not-installed`: Extension is not installed
- `forbidden-origin`: Origin is not allowed to use the extension
- `unsupported-origin`: Origin protocol is not supported (only http/https allowed)

### Enable CORS

```typescript
try {
  await appCors.enable({ credentials: true, reason: 'Testing API' });
  console.log('CORS enabled successfully');
} catch (error) {
  console.error('Failed to enable CORS:', error.message);
  console.error('Error type:', error.type);
}
```

**Parameters:**
- `options` (optional): `{ credentials?: boolean, reason?: string }`

**Returns:** `Promise<void>`

**Throws:** `AppCorsError` with specific error types:
- `not-installed`: Extension is not installed
- `user-cancel`: User canceled the operation in confirmation dialog
- `forbidden-origin`: Origin is not allowed to use the extension
- `unsupported-origin`: Origin protocol is not supported (only http/https allowed)
- `inner-error`: Internal extension error occurred

### Disable CORS

```typescript
try {
  await appCors.disable();
  console.log('CORS disabled successfully');
} catch (error) {
  console.error('Failed to disable CORS:', error.message);
  console.error('Error type:', error.type);
}
```

**Returns:** `Promise<void>`

**Throws:** `AppCorsError` with specific error types:
- `not-installed`: Extension is not installed
- `forbidden-origin`: Origin is not allowed to use the extension
- `unsupported-origin`: Origin protocol is not supported (only http/https allowed)
- `inner-error`: Internal extension error occurred

### Listen for CORS Status Changes

```typescript
const onChangeListener = (status) => {
  console.log('CORS status changed:', status);
};

appCors.onChange.addListener(onChangeListener);

// To remove the listener
appCors.onChange.removeListener(onChangeListener);
```

**onChange:**
- `addListener(callback: (status: { enabled: boolean, credentials: boolean }) => void): void`
- `removeListener(callback?: (status: { enabled: boolean, credentials: boolean }) => void): void`

### Open Extension Options Page

```typescript
try {
  await appCors.openExtOptions();
  console.log('Options page opened successfully');
} catch (error) {
  console.error('Failed to open options page:', error.message);
  console.error('Error type:', error.type);
}
```

**Returns:** `Promise<void>`

**Throws:** `AppCorsError` with specific error types:
- `not-installed`: Extension is not installed
- `forbidden-origin`: Origin is not allowed to use the extension

### Open Extension Store Page

```typescript
appCors.openStorePage();
```

**Returns:** `void`

## Error Handling

All async methods in this library throw `AppCorsError` when something goes wrong. The error object contains:

- `message`: Human-readable error description
- `type`: Specific error type for programmatic handling

### Common Error Types

| Error Type | Description |
|------------|-------------|
| `not-installed` | The browser extension is not installed |
| `forbidden-origin` | Your website's origin is not allowed to use the extension |
| `rate-limit` | Too many requests sent to the extension |
| `user-cancel` | User canceled the operation in the confirmation dialog |
| `unsupported-origin` | The page protocol is not supported (only http/https allowed) |
| `invalid-sender` | Invalid message sender |
| `missing-method` | Method not specified in message |
| `missing-origin` | Origin not specified in payload |
| `unsupported-method` | Method not supported by extension |
| `config-error` | Extension configuration error |
| `invalid-origin` | Origin format is invalid |
| `inner-error` | Internal extension error |
| `communication-failed` | Failed to communicate with extension |
| `unknown-error` | Unexpected error occurred |

### Error Handling Example

```typescript
import appCors, { AppCorsError } from 'cors-unlocker';

try {
  await appCors.enable({ credentials: true });
  console.log('CORS enabled successfully');
} catch (error) {
  if (error instanceof AppCorsError) {
    switch (error.type) {
      case 'not-installed':
        console.log('Please install the CORS Unlocker extension');
        appCors.openStorePage();
        break;
      case 'user-cancel':
        console.log('User canceled the operation');
        break;
      case 'forbidden-origin':
        console.log('This website is not allowed to use the extension');
        break;
      default:
        console.error('Operation failed:', error.message);
    }
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## License

MIT
