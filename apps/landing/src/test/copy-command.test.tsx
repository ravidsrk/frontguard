import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { CopyCommand } from '../components/ui/CopyCommand';

// navigator.clipboard is a getter-only property in jsdom; override it explicitly.
// (We use fireEvent rather than userEvent here because userEvent.setup() installs
// its own clipboard stub, which would mask the path under test.)
function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
}

describe('CopyCommand', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setClipboard(undefined);
  });

  it('renders the prompt and command', () => {
    render(<CopyCommand command="npm install @frontguard/cli" />);
    expect(screen.getByText('npm install @frontguard/cli')).toBeInTheDocument();
  });

  it('toggles to "copied ✓" via the async clipboard API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    render(<CopyCommand command="npx frontguard init" />);
    fireEvent.click(screen.getByRole('button', { name: /copy command/i }));

    expect(await screen.findByText('copied ✓')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('npx frontguard init');
  });

  it('falls back to execCommand when the clipboard API is unavailable', async () => {
    setClipboard(undefined);
    const execCommand = vi.fn().mockReturnValue(true);
    // jsdom doesn't implement execCommand; define it for the fallback.
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true, writable: true });

    render(<CopyCommand command="npx frontguard init --ci" />);
    fireEvent.click(screen.getByRole('button', { name: /copy command/i }));

    expect(await screen.findByText('copied ✓')).toBeInTheDocument();
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('reverts the label back after the timeout', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    render(<CopyCommand command="ls" />);
    fireEvent.click(screen.getByRole('button', { name: /copy command/i }));
    expect(await screen.findByText('copied ✓')).toBeInTheDocument();

    // The label reverts after 1600ms (real timers).
    await waitFor(() => expect(screen.queryByText('copied ✓')).not.toBeInTheDocument(), {
      timeout: 2500,
    });
  });
});
