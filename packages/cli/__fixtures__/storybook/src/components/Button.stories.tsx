import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: {
    children: 'Click me',
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    variant: 'primary',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
  },
  parameters: {
    frontguard: {
      // Buttons render the same at every width — narrow to one.
      viewports: [768],
      threshold: 0.005,
    },
  },
};

export const Danger: Story = {
  args: {
    variant: 'danger',
    children: 'Delete account',
  },
  parameters: {
    frontguard: {
      // The hover ring includes a subtle gradient that pixelmatch over-flags.
      ignore: [{ selector: '.fg-mask' }],
    },
  },
};

export const Disabled: Story = {
  args: {
    variant: 'primary',
    disabled: true,
  },
};
