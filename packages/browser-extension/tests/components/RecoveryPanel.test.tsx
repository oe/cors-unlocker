import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecoveryPanel } from '../../src/options/recovery-panel';
import { migrateLegacyState, performProxyStateOperation } from '../../src/common/proxy-state';

vi.mock('../../src/common/proxy-state', async (original) => ({
  ...await original<typeof import('../../src/common/proxy-state')>(),
  performProxyStateOperation: vi.fn(),
}));
beforeEach(() => { vi.clearAllMocks(); });

describe('damaged configuration recovery', () => {
  it('previews a valid backup and restores only after the user applies it', async () => {
    const user = userEvent.setup(); const reload = vi.fn();
    const state = migrateLegacyState([], {}, 1);
    vi.mocked(performProxyStateOperation).mockResolvedValue(state);
    render(<RecoveryPanel reload={reload} />);
    expect(screen.getByText('Original data is preserved. Export it before restoring a valid backup.')).toBeVisible();
    await user.upload(screen.getByLabelText('Import'), new File([JSON.stringify({ version: '2.0', state })], 'valid.json', { type: 'application/json' }));
    expect(screen.getByRole('region', { name: 'Import preview' })).toBeVisible();
    expect(performProxyStateOperation).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Apply import' }));
    expect(performProxyStateOperation).toHaveBeenCalledWith({ kind: 'recover', state });
    expect(reload).toHaveBeenCalledOnce();
  });
  it('rejects malformed backups and leaves existing data untouched', async () => {
    const user = userEvent.setup();
    render(<RecoveryPanel reload={vi.fn()} />);
    await user.upload(screen.getByLabelText('Import'), new File(['{"version":"2.0","state":{}}'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid v2 configuration');
    expect(screen.queryByRole('button', { name: 'Apply import' })).not.toBeInTheDocument();
    expect(performProxyStateOperation).not.toHaveBeenCalled();
  });
});
