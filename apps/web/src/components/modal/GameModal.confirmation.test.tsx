import { act, fireEvent, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import GameModal from './GameModal';
import { renderWithProviders } from '../../test/render';
import { deferred, missionModal } from '../../test/fixtures/missionLifecycle';

function confirmationSpec() {
  const spec = missionModal('phase_ready');
  spec.dismiss = { x: false, backdrop: false, escape: false };
  spec.buttons![0].requiresConfirm = { title: 'Continue this mission?', confirmLabel: 'Yes, continue', cancelLabel: 'Keep planning' };
  return spec;
}
const props = () => ({ isOpen: true, missionSurface: true, onRequestClose: vi.fn(), navigate: vi.fn(), onAction: vi.fn().mockResolvedValue(undefined) });

it('isolates confirmation focus and cancels with Escape even when the mission cannot close', () => {
  const handlers = props();
  renderWithProviders(<GameModal {...handlers} spec={confirmationSpec()} />);
  const trigger = screen.getByRole('button', { name: 'Continue' });
  trigger.focus(); fireEvent.click(trigger);
  const cancel = screen.getByRole('button', { name: 'Keep planning' });
  const confirm = screen.getByRole('button', { name: 'Yes, continue' });
  expect(cancel).toHaveFocus();
  expect(trigger.closest('[inert]')).not.toBeNull();
  fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
  expect(confirm).toHaveFocus();
  fireEvent.keyDown(confirm, { key: 'Tab' });
  expect(cancel).toHaveFocus();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(trigger.closest('[inert]')).toBeNull();
  expect(handlers.onRequestClose).not.toHaveBeenCalled();
  expect(handlers.onAction).not.toHaveBeenCalled();
});

it('supports repeated cancel/reopen and sends only one confirmed pending action', async () => {
  const pending = deferred<void>(); const handlers = props();
  handlers.onAction.mockReturnValue(pending.promise);
  renderWithProviders(<GameModal {...handlers} spec={confirmationSpec()} />);
  for (let i = 0; i < 2; i++) {
    const trigger = screen.getByRole('button', { name: 'Continue' });
    trigger.focus(); fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Keep planning' }));
    expect(trigger).toHaveFocus();
  }
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  const dialog = screen.getByRole('alertdialog');
  const confirm = within(dialog).getByRole('button', { name: 'Yes, continue' });
  fireEvent.click(confirm); fireEvent.click(confirm);
  expect(handlers.onAction).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  await act(async () => pending.resolve());
});

it('removes confirmation isolation when a live spec replaces it or the modal closes', () => {
  const handlers = props();
  const view = renderWithProviders(<GameModal {...handlers} spec={confirmationSpec()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  view.rerender(<GameModal {...handlers} spec={missionModal('completed')} />);
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Close' }).closest('[inert]')).toBeNull();
  view.rerender(<GameModal {...handlers} spec={confirmationSpec()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  view.rerender(<GameModal {...handlers} isOpen={false} spec={confirmationSpec()} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  view.rerender(<GameModal {...handlers} spec={missionModal('completed')} />);
  expect(screen.getByRole('dialog')).toHaveFocus();
});
