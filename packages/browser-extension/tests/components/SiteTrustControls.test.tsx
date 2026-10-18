import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SiteTrustControls } from '../../src/popup/site-trust-controls';
afterEach(cleanup);
const origin = 'https://app.example';
it('shows default confirmation and lets the user explicitly grant trust', () => {
  const change = vi.fn();
  render(<SiteTrustControls origin={origin} access={{ origin, trusted: false }} disabled={false} onTrustChange={change} />);
  fireEvent.click(screen.getByText('Website control', { exact: true }).closest('summary')!);
  const toggle = screen.getByRole('switch', { name: 'Trust this site to control rules' });
  expect(toggle).not.toBeChecked();
  expect(screen.getByText('Website changes require your approval. Trust is off by default.')).toBeVisible();
  fireEvent.click(toggle);
  expect(change).toHaveBeenCalledWith(true);
});
it('shows trust limits and the last completed operation', () => {
  render(<SiteTrustControls origin={origin} access={{ origin, trusted: true, lastOperation: { label: 'Disable this rule?', at: 1000 } }} disabled={false} onTrustChange={vi.fn()} />);
  fireEvent.click(screen.getByText('Website control', { exact: true }).closest('summary')!);
  expect(screen.getByRole('switch')).toBeChecked();
  expect(screen.getByText(/Credential access still requires approval/)).toBeVisible();
  expect(screen.getByText(/leaves saved rules unchanged/)).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('Disable this rule?');
});
it('does not display stale trust or operations after changing sites', () => {
  render(<SiteTrustControls origin="https://other.example" access={{ origin, trusted: true, lastOperation: { label: 'Disable this rule?', at: 1000 } }} disabled={false} onTrustChange={vi.fn()} />);
  fireEvent.click(screen.getByText('Website control', { exact: true }).closest('summary')!);
  expect(screen.getByRole('switch')).not.toBeChecked();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByText('Website changes require your approval. Trust is off by default.')).toBeVisible();
});
