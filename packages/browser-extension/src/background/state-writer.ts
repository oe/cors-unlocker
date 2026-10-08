import { initializeProxyStateWriter } from '@/common/proxy-state';

// Set the context before storage/config imports perform their first asynchronous read.
initializeProxyStateWriter();
