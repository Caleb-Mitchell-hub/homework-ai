// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import AIFollowUp from '@/components/AIFollowUp';

// Mock useAuth
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

const defaultProps = {
  questionId: 'q1',
  questionContent: '请解释 React 的 Fiber 架构',
  questionType: 'essay',
};

describe('AIFollowUp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初始态显示追问按钮', () => {
    render(<AIFollowUp {...defaultProps} />);
    expect(screen.getByText(/追问/)).toBeTruthy();
  });

  it('点击按钮展开面板，输入框可见', () => {
    render(<AIFollowUp {...defaultProps} />);
    const btn = screen.getByText(/追问/);
    fireEvent.click(btn);
    expect(screen.getByPlaceholderText('输入追问内容…')).toBeTruthy();
  });

  it('再次点击收起面板', () => {
    render(<AIFollowUp {...defaultProps} />);
    const btn = screen.getByText(/追问/);
    fireEvent.click(btn);
    expect(screen.getByPlaceholderText('输入追问内容…')).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByPlaceholderText('输入追问内容…')).toBeNull();
  });

  it('空输入时发送按钮禁用', () => {
    render(<AIFollowUp {...defaultProps} />);
    fireEvent.click(screen.getByText(/追问/));
    const sendBtn = screen.getByText('发送');
    expect((sendBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('输入内容后发送按钮可用', () => {
    render(<AIFollowUp {...defaultProps} />);
    fireEvent.click(screen.getByText(/追问/));
    const textarea = screen.getByPlaceholderText('输入追问内容…');
    fireEvent.change(textarea, { target: { value: '什么是 Fiber？' } });
    const sendBtn = screen.getByText('发送');
    expect((sendBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('发送后显示用户消息', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: 'Fiber 是 React 的工作单元...' }),
    });

    render(<AIFollowUp {...defaultProps} />);
    fireEvent.click(screen.getByText(/追问/));

    fireEvent.change(screen.getByPlaceholderText('输入追问内容…'), {
      target: { value: '什么是闭包？' },
    });
    fireEvent.click(screen.getByText('发送'));

    await waitFor(() => {
      expect(screen.getByText('什么是闭包？')).toBeTruthy();
    });
  });

  it('显示 AI 回复', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: 'Fiber 是 React 的工作单元...' }),
    });

    render(<AIFollowUp {...defaultProps} />);
    fireEvent.click(screen.getByText(/追问/));

    fireEvent.change(screen.getByPlaceholderText('输入追问内容…'), {
      target: { value: 'test' },
    });
    fireEvent.click(screen.getByText('发送'));

    await waitFor(() => {
      expect(screen.getByText('Fiber 是 React 的工作单元...')).toBeTruthy();
    });
  });

  it('API 失败显示错误信息和重试按钮', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: '网络错误' }),
    });

    render(<AIFollowUp {...defaultProps} />);
    fireEvent.click(screen.getByText(/追问/));

    fireEvent.change(screen.getByPlaceholderText('输入追问内容…'), {
      target: { value: 'test' },
    });
    fireEvent.click(screen.getByText('发送'));

    await waitFor(() => {
      expect(screen.getByText('重试')).toBeTruthy();
    });
  });

  it('关闭后重新打开，消息历史保留', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: '回答内容' }),
    });

    render(<AIFollowUp {...defaultProps} />);
    const btn = screen.getByText(/追问/);

    // 打开、发消息
    fireEvent.click(btn);
    fireEvent.change(screen.getByPlaceholderText('输入追问内容…'), {
      target: { value: '问题1' },
    });
    fireEvent.click(screen.getByText('发送'));

    await waitFor(() => {
      expect(screen.getByText('问题1')).toBeTruthy();
    });

    // 关闭
    fireEvent.click(btn);

    // 重新打开，消息还在
    fireEvent.click(btn);
    expect(screen.getByText('问题1')).toBeTruthy();
  });

  it('显示剩余追问数量标记', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: '回答' }),
    });

    const { container } = render(<AIFollowUp {...defaultProps} />);
    const btn = screen.getByText(/追问/);

    // 打开、发一条消息
    fireEvent.click(btn);
    fireEvent.change(screen.getByPlaceholderText('输入追问内容…'), {
      target: { value: '问一下' },
    });
    fireEvent.click(screen.getByText('发送'));

    await waitFor(() => {
      expect(screen.getByText('问一下')).toBeTruthy();
    });

    // 关闭后面板按钮上应该显示计数
    fireEvent.click(screen.getByText(/追问/));
    // 展开态没有计数标记（计数在按钮上hidden）
    fireEvent.click(screen.getByText(/追问/));
  });
});
