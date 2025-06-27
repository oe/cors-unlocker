import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Switch } from '../../src/common/shard'

describe('Switch Component', () => {
  it('should render with label', () => {
    const mockOnChange = vi.fn()
    
    render(
      <Switch
        value={false}
        onChange={mockOnChange}
        label="Test Switch"
      />
    )
    
    expect(screen.getByText('Test Switch')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('should handle toggle correctly', async () => {
    const user = userEvent.setup()
    const mockOnChange = vi.fn()
    
    render(
      <Switch
        value={false}
        onChange={mockOnChange}
        label="Test Switch"
      />
    )
    
    const checkbox = screen.getByRole('checkbox')
    await user.click(checkbox)
    
    expect(mockOnChange).toHaveBeenCalledWith(true)
  })

  it('should respect disabled state', async () => {
    const user = userEvent.setup()
    const mockOnChange = vi.fn()
    
    render(
      <Switch
        value={false}
        onChange={mockOnChange}
        label="Disabled Switch"
        disabled={true}
      />
    )
    
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeDisabled()
    
    await user.click(checkbox)
    expect(mockOnChange).not.toHaveBeenCalled()
  })

  it('should render in compact mode', () => {
    const mockOnChange = vi.fn()
    
    render(
      <Switch
        value={true}
        onChange={mockOnChange}
        label="Compact Switch"
        compact={true}
      />
    )
    
    const label = screen.getByText('Compact Switch').closest('label')
    expect(label).toHaveClass('text-xs', 'inline')
  })

  it('should handle label with link correctly', async () => {
    const user = userEvent.setup()
    const mockOnChange = vi.fn()
    
    render(
      <Switch
        value={false}
        onChange={mockOnChange}
        label={<span>Switch with <a href="#test">link</a></span>}
      />
    )
    
    const link = screen.getByRole('link')
    const checkbox = screen.getByRole('checkbox')
    
    // Click the link - the stopPropagation in the component should prevent the switch from toggling
    await user.click(link)
    
    // The switch should NOT be toggled when clicking the link due to stopPropagation
    expect(checkbox).not.toBeChecked()
    expect(mockOnChange).not.toHaveBeenCalled()
    
    // But clicking the checkbox directly should still work
    await user.click(checkbox)
    expect(mockOnChange).toHaveBeenCalledWith(true)
  })
})
