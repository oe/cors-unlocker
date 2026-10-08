# cors-unlocker

Compatibility package for the renamed [Forth Intercept](https://intercept.forth.ink) SDK.

New applications should install and import `forth-intercept`:

```bash
pnpm add forth-intercept
```

Existing applications can continue using `cors-unlocker@0.2`. It re-exports the complete `forth-intercept` API, including the deprecated v1 helper aliases.

```ts
import { intercept } from 'cors-unlocker';

const session = await intercept.connect();
```
