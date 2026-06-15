import type { Meta, StoryObj } from '@storybook/react';
import { userEvent, within, expect } from '@storybook/test';
import { Modal } from './Modal';

const meta = {
  title: 'Components/Modal',
  component: Modal,
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Closed state — no interaction. Frontguard captures the trigger button only.
 */
export const Closed: Story = {
  args: {
    defaultOpen: false,
  },
};

/**
 * Open state via initial prop — no `play()` required.
 */
export const OpenByDefault: Story = {
  args: {
    defaultOpen: true,
  },
};

/**
 * Click-to-open via `play()`.
 *
 * Frontguard's renderer waits for `play()` to complete before capturing,
 * so this story tests that the modal overlay is present in the screenshot.
 * If we captured pre-play(), only the trigger button would appear and the
 * baseline would be useless.
 */
export const OpenedByPlay: Story = {
  args: {
    defaultOpen: false,
    triggerLabel: 'Open the modal',
  },
  parameters: {
    layout: 'centered',
    // Per-story override: the modal renders the same at all widths, narrow.
    frontguard: {
      viewports: [1024],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByTestId('modal-trigger');
    await userEvent.click(trigger);
    // Assert the overlay actually rendered before play() returns.
    await expect(await canvas.findByTestId('modal-overlay')).toBeInTheDocument();
  },
};
