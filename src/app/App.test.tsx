import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('app shell', () => {
  it('renders the simulator layout', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Anthropocene Simulator' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Old World Corridor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Interventions' })).toBeInTheDocument();
  });
});

