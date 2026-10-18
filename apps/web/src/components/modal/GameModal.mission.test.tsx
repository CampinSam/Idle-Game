import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import GameModal from './GameModal';
import { missionModal } from '../../test/fixtures/missionLifecycle';
import { renderWithProviders } from '../../test/render';
it('keeps focus inside the replaced mission dialog and displays rejected actions', async () => {
  const action = vi.fn().mockRejectedValue(new Error('Mission not ready yet'));
  const props = { isOpen: true, missionSurface: true, onRequestClose: vi.fn(), navigate: vi.fn(), onAction: action };
  const { rerender } = renderWithProviders(<GameModal {...props} spec={missionModal('ready_notified')} />);
  fireEvent.click(screen.getByRole('button', { name: 'Collect' }));
  await screen.findByText('Mission not ready yet');
  rerender(<GameModal {...props} spec={missionModal('completed')} />);
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
  expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
});
