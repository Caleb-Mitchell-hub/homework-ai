// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ParseChoiceDialog from '@/components/ParseChoiceDialog';

describe('ParseChoiceDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ParseChoiceDialog open={false} onClose={() => {}} onSelect={() => {}} aiAvailable={true} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders two cards when open', () => {
    const { getByText } = render(
      <ParseChoiceDialog open={true} onClose={() => {}} onSelect={() => {}} aiAvailable={true} />
    );
    expect(getByText('本地解析')).toBeTruthy();
    expect(getByText('AI 解析')).toBeTruthy();
  });

  it('calls onSelect(local) when local card clicked', () => {
    const onSelect = vi.fn();
    const { getAllByText } = render(
      <ParseChoiceDialog open={true} onClose={() => {}} onSelect={onSelect} aiAvailable={true} />
    );
    fireEvent.click(getAllByText('本地解析')[0]);
    expect(onSelect).toHaveBeenCalledWith('local');
  });

  it('calls onSelect(ai) when AI card clicked and aiAvailable', () => {
    const onSelect = vi.fn();
    const { getAllByText } = render(
      <ParseChoiceDialog open={true} onClose={() => {}} onSelect={onSelect} aiAvailable={true} />
    );
    fireEvent.click(getAllByText('AI 解析')[0]);
    expect(onSelect).toHaveBeenCalledWith('ai');
  });

  it('disables AI card when aiAvailable=false and shows unavailability message', () => {
    const onSelect = vi.fn();
    const { getByText, getAllByText } = render(
      <ParseChoiceDialog open={true} onClose={() => {}} onSelect={onSelect} aiAvailable={false} />
    );
    expect(getByText('未配置 AI 厂商')).toBeTruthy();
    const aiCard = getAllByText('AI 解析')[0].closest('button')!;
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
});
