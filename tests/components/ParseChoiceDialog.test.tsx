// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import ParseChoiceDialog from '@/components/ParseChoiceDialog';

describe('ParseChoiceDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ParseChoiceDialog open={false} onClose={() => {}} onSelect={() => {}} aiAvailable={true} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders two cards when open', () => {
    render(
      <ParseChoiceDialog open={true} onClose={() => {}} onSelect={() => {}} aiAvailable={true} />
    );
    expect(screen.getByRole('button', { name: /本地解析/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /AI 解析/ })).toBeTruthy();
  });

  it('calls onSelect(local) when local card clicked', () => {
    const onSelect = vi.fn();
    render(
      <ParseChoiceDialog open={true} onClose={() => {}} onSelect={onSelect} aiAvailable={true} />
    );
    fireEvent.click(screen.getByRole('button', { name: /本地解析/ }));
    expect(onSelect).toHaveBeenCalledWith('local');
  });

  it('calls onSelect(ai) when AI card clicked and aiAvailable', () => {
    const onSelect = vi.fn();
    render(
      <ParseChoiceDialog open={true} onClose={() => {}} onSelect={onSelect} aiAvailable={true} />
    );
    fireEvent.click(screen.getByRole('button', { name: /AI 解析/ }));
    expect(onSelect).toHaveBeenCalledWith('ai');
  });

  it('disables AI card when aiAvailable=false and shows unavailability message', () => {
    const onSelect = vi.fn();
    render(
      <ParseChoiceDialog open={true} onClose={() => {}} onSelect={onSelect} aiAvailable={false} />
    );
    expect(screen.getByText('未配置 AI 厂商')).toBeTruthy();
    const aiCard = screen.getByRole('button', { name: /AI 解析/ });
    expect(aiCard).toHaveProperty('disabled', true);
    // clicking disabled button doesn't trigger onSelect
    fireEvent.click(aiCard);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('calls onClose when overlay clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ParseChoiceDialog open={true} onClose={onClose} onSelect={() => {}} aiAvailable={true} />
    );
    const overlay = container.querySelector('.fixed.inset-0')!;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when ESC pressed', () => {
    const onClose = vi.fn();
    render(
      <ParseChoiceDialog open={true} onClose={onClose} onSelect={() => {}} aiAvailable={true} />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onClose when inner dialog panel is clicked', () => {
    const onClose = vi.fn();
    render(
      <ParseChoiceDialog open={true} onClose={onClose} onSelect={() => {}} aiAvailable={true} />
    );
    // clicking the title (which lives inside the inner panel) should not bubble to overlay
    fireEvent.click(screen.getByText('选择解析方式'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('locks body scroll when open and restores when closed', () => {
    const originalOverflow = document.body.style.overflow;
    const { rerender, unmount } = render(
      <ParseChoiceDialog open={true} onClose={() => {}} onSelect={() => {}} aiAvailable={true} />
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <ParseChoiceDialog open={false} onClose={() => {}} onSelect={() => {}} aiAvailable={true} />
    );
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(document.body.style.overflow).toBe(originalOverflow);
    unmount();
  });
});