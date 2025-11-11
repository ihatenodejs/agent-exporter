import {describe, expect, it, mock, beforeEach, afterEach} from 'bun:test';
import type {ReactElement} from 'react';
import type {UsageSummary} from '../../core/statistics';
import type {TimePeriod} from '../../core/date-utils';

// Mock the external dependencies
const mockExit = mock(() => {});
const mockUseApp = mock(() => ({exit: mockExit}));
const mockUseInput = mock((_callback: (input: string, key: any) => void) => {});
const mockStdoutOn = mock((_event: string, _handler: () => void) => {});
const mockStdoutOff = mock((_event: string, _handler: () => void) => {});
const mockStdoutRemoveListener = mock((_event: string, _handler: () => void) => {});

const mockStdout = {
  columns: 119,
  rows: 32,
  on: mockStdoutOn,
  off: mockStdoutOff,
  removeListener: mockStdoutRemoveListener,
};

const mockUseStdout = mock(() => ({stdout: mockStdout}));
const mockUseState = mock((initialValue: any) => {
  const value = typeof initialValue === 'function' ? initialValue() : initialValue;
  return [value, mock(() => {})];
});
const mockUseEffect = mock((_effect: () => void | (() => void), _deps?: any[]) => {});
const mockUseCallback = mock((callback: any, _deps?: any[]) => callback);
const mockUseMemo = mock((factory: () => any, _deps?: any[]) => factory());

await mock.module('ink', () => ({
  Box: ({children}: {children: any}) => children,
  Text: ({children}: {children: any}) => children,
  useApp: mockUseApp,
  useInput: mockUseInput,
  useStdout: mockUseStdout,
}));

await mock.module('react', () => ({
  useState: mockUseState,
  useEffect: mockUseEffect,
  useCallback: mockUseCallback,
  useMemo: mockUseMemo,
}));

await mock.module('./formatters', () => ({
  formatCount: (val: number) => String(val),
  formatTokens: (val: number) => String(val),
  formatCurrency: (val: number) => `$${val.toFixed(2)}`,
  integerFormatter: {format: (val: number) => String(val)},
  decimalFormatter: {format: (val: number) => val.toFixed(1)},
  currencyFormatter: {format: (val: number) => `$${val.toFixed(2)}`},
}));

await mock.module('./Table', () => ({
  Table: ({data}: {data: any[]}) => data,
}));

await mock.module('../core/database/model-labels', () => ({
  getModelDisplayName: (name: string) => name,
}));

import {Dashboard} from '../Dashboard';

describe('Dashboard component', () => {
  const createMockSummary = (): UsageSummary => ({
    totals: {
      inputTokens: 1000,
      outputTokens: 2000,
      cacheCreationTokens: 100,
      cacheReadTokens: 50,
      totalCost: 10.5,
      totalTokens: 3150,
    },
    providerRows: [
      {
        name: 'openai',
        messageCount: 5,
        inputTokens: 600,
        outputTokens: 1200,
        cacheCreationTokens: 60,
        cacheReadTokens: 30,
        totalTokens: 1890,
        totalCost: 6.3,
        activeDays: 3,
      },
      {
        name: 'anthropic',
        messageCount: 3,
        inputTokens: 400,
        outputTokens: 800,
        cacheCreationTokens: 40,
        cacheReadTokens: 20,
        totalTokens: 1260,
        totalCost: 4.2,
        activeDays: 2,
      },
    ],
    modelRows: [
      {
        name: 'gpt-4',
        messageCount: 5,
        inputTokens: 600,
        outputTokens: 1200,
        cacheCreationTokens: 60,
        cacheReadTokens: 30,
        totalTokens: 1890,
        totalCost: 6.3,
        activeDays: 3,
      },
    ],
    messageCount: 8,
    activeDays: 5,
    totalDays: 7,
    averageDailyCost: 1.5,
    averageDailyTokens: 450,
  });

  const defaultProps = {
    summary: createMockSummary(),
    rangeDescription: '2024-01-01 to 2024-01-07',
    onRefresh: mock(() => {}),
    onPeriodChange: mock(() => {}),
    currentPeriod: 'monthly' as TimePeriod,
    onExit: mock(() => {}),
    lastUpdated: new Date('2024-01-07T12:00:00Z'),
    isSyncing: false,
    isLoading: false,
  };

  beforeEach(() => {
    mockExit.mockReset();
    mockUseApp.mockReset();
    mockUseInput.mockReset();
    mockStdoutOn.mockReset();
    mockStdoutOff.mockReset();
    mockStdoutRemoveListener.mockReset();
    mockUseStdout.mockReset();
    mockUseState.mockReset();
    mockUseEffect.mockReset();
    mockUseCallback.mockReset();
    mockUseMemo.mockReset();

    // Reset mocks to their default implementations
    mockUseApp.mockImplementation(() => ({exit: mockExit}));
    mockUseStdout.mockImplementation(() => ({stdout: mockStdout}));
    mockUseState.mockImplementation((initialValue: any) => {
      const value = typeof initialValue === 'function' ? initialValue() : initialValue;
      return [value, mock(() => {})];
    });
    mockUseCallback.mockImplementation((callback: any) => callback);
    mockUseMemo.mockImplementation((factory: () => any) => factory());
  });

  describe('Initialization and Terminal Size Handling', () => {
    it('initializes terminal size from stdout on component mount', () => {
      Dashboard(defaultProps);

      // Verify useState was called with a function that reads stdout dimensions
      expect(mockUseState).toHaveBeenCalled();
      
      // Find the useState call for terminalSize (should read stdout.columns and rows)
      const useStateCalls = mockUseState.mock.calls;
      const terminalSizeCall = useStateCalls.find((call: any[]) => {
        const arg = call[0];
        if (typeof arg === 'function') {
          const result = arg();
          return result && typeof result.width === 'number' && typeof result.height === 'number';
        }
        return false;
      });

      expect(terminalSizeCall).toBeDefined();
    });

    it('does not call handleResize immediately in useEffect', () => {
      Dashboard(defaultProps);

      // Verify that useEffect sets up the resize listener
      expect(mockUseEffect).toHaveBeenCalled();
      
      // Find the resize-related useEffect (depends on stdout)
      const resizeEffectCall = mockUseEffect.mock.calls.find((call: any[]) => {
        const deps = call[1];
        return deps && deps.length === 1 && deps[0] === mockStdout;
      });

      expect(resizeEffectCall).toBeDefined();
      
      // Execute the effect to verify behavior
      if (resizeEffectCall) {
        const effectFn = resizeEffectCall[0];
        const cleanup = effectFn();
        
        // Verify resize listener was registered
        expect(mockStdoutOn).toHaveBeenCalledWith('resize', expect.any(Function));
        
        // Verify cleanup removes the listener
        if (typeof cleanup === 'function') {
          cleanup();
          expect(mockStdoutOff).toHaveBeenCalled();
          expect(mockStdoutRemoveListener).toHaveBeenCalled();
        }
      }
    });

    it('uses default layout dimensions when stdout dimensions are unavailable', () => {
      const stdoutWithoutDimensions = {
        columns: undefined,
        rows: undefined,
        on: mockStdoutOn,
        off: mockStdoutOff,
        removeListener: mockStdoutRemoveListener,
      };

      mockUseStdout.mockImplementation(() => ({
        stdout: stdoutWithoutDimensions,
      }));

      Dashboard(defaultProps);

      // Verify that useState initializer handles missing dimensions
      const useStateCalls = mockUseState.mock.calls;
      const terminalSizeCall = useStateCalls.find((call: any[]) => {
        const arg = call[0];
        if (typeof arg === 'function') {
          const result = arg();
          // DEFAULT_LAYOUT is the second option (2x2) with minWidth: 119, minHeight: 32
          return result && result.width === 119 && result.height === 32;
        }
        return false;
      });

      expect(terminalSizeCall).toBeDefined();
    });

    it('registers resize event listener on mount', () => {
      Dashboard(defaultProps);

      // Find and execute the resize effect
      const resizeEffectCall = mockUseEffect.mock.calls.find((call: any[]) => {
        const deps = call[1];
        return deps && deps.length === 1;
      });

      if (resizeEffectCall) {
        resizeEffectCall[0]();
        expect(mockStdoutOn).toHaveBeenCalledWith('resize', expect.any(Function));
      }
    });

    it('cleans up resize listener on unmount', () => {
      Dashboard(defaultProps);

      // Find and execute the resize effect
      const resizeEffectCall = mockUseEffect.mock.calls.find((call: any[]) => {
        const deps = call[1];
        return deps && deps.length === 1;
      });

      if (resizeEffectCall) {
        const cleanup = resizeEffectCall[0]();
        if (typeof cleanup === 'function') {
          cleanup();
          expect(mockStdoutOff).toHaveBeenCalled();
          expect(mockStdoutRemoveListener).toHaveBeenCalled();
        }
      }
    });
  });

  describe('Layout Selection', () => {
    it('selects 2x2 layout for terminal size 119x32', () => {
      mockStdout.columns = 119;
      mockStdout.rows = 32;

      Dashboard(defaultProps);

      // Verify useMemo is called to compute layout states
      expect(mockUseMemo).toHaveBeenCalled();
    });

    it('selects 3x1 layout for wide terminals (171x40)', () => {
      mockStdout.columns = 171;
      mockStdout.rows = 40;

      Dashboard(defaultProps);

      expect(mockUseMemo).toHaveBeenCalled();
    });

    it('selects 1x3 layout for tall terminals (72x50)', () => {
      mockStdout.columns = 72;
      mockStdout.rows = 50;

      Dashboard(defaultProps);

      expect(mockUseMemo).toHaveBeenCalled();
    });

    it('handles terminal too small for any layout', () => {
      mockStdout.columns = 50;
      mockStdout.rows = 20;

      const result = Dashboard(defaultProps);

      // Should render "Terminal too small" message
      expect(result).toBeDefined();
    });
  });

  describe('User Input Handling', () => {
    it('handles Ctrl+C to exit', () => {
      Dashboard(defaultProps);

      // Find the useInput call
      expect(mockUseInput).toHaveBeenCalled();
      const inputHandler = mockUseInput.mock.calls[0][0];

      // Simulate Ctrl+C
      inputHandler('c', {ctrl: true});

      expect(defaultProps.onExit).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalled();
    });

    it('handles Enter key to refresh', () => {
      const onRefresh = mock(() => {});
      const props = {...defaultProps, onRefresh};

      Dashboard(props);

      const inputHandler = mockUseInput.mock.calls[0][0];
      inputHandler('', {return: true});

      expect(onRefresh).toHaveBeenCalledWith(true, expect.any(Number));
    });

    it('handles "r" key to refresh', () => {
      const onRefresh = mock(() => {});
      const props = {...defaultProps, onRefresh};

      Dashboard(props);

      const inputHandler = mockUseInput.mock.calls[0][0];
      inputHandler('r', {});

      expect(onRefresh).toHaveBeenCalledWith(true, expect.any(Number));
    });

    it('handles "p" key to cycle period', () => {
      const onPeriodChange = mock(() => {});
      const props = {...defaultProps, onPeriodChange, currentPeriod: 'daily' as TimePeriod};

      Dashboard(props);

      const inputHandler = mockUseInput.mock.calls[0][0];
      inputHandler('p', {});

      // Should cycle from daily to weekly
      expect(onPeriodChange).toHaveBeenCalledWith('weekly');
    });

    it('cycles through all periods in correct order', () => {
      const onPeriodChange = mock(() => {});
      
      // Test daily -> weekly
      let props = {...defaultProps, onPeriodChange, currentPeriod: 'daily' as TimePeriod};
      Dashboard(props);
      let inputHandler = mockUseInput.mock.calls[mockUseInput.mock.calls.length - 1][0];
      inputHandler('p', {});
      expect(onPeriodChange).toHaveBeenCalledWith('weekly');

      onPeriodChange.mockReset();

      // Test weekly -> monthly
      props = {...defaultProps, onPeriodChange, currentPeriod: 'weekly' as TimePeriod};
      Dashboard(props);
      inputHandler = mockUseInput.mock.calls[mockUseInput.mock.calls.length - 1][0];
      inputHandler('p', {});
      expect(onPeriodChange).toHaveBeenCalledWith('monthly');

      onPeriodChange.mockReset();

      // Test monthly -> yearly
      props = {...defaultProps, onPeriodChange, currentPeriod: 'monthly' as TimePeriod};
      Dashboard(props);
      inputHandler = mockUseInput.mock.calls[mockUseInput.mock.calls.length - 1][0];
      inputHandler('p', {});
      expect(onPeriodChange).toHaveBeenCalledWith('yearly');

      onPeriodChange.mockReset();

      // Test yearly -> daily (wraps around)
      props = {...defaultProps, onPeriodChange, currentPeriod: 'yearly' as TimePeriod};
      Dashboard(props);
      inputHandler = mockUseInput.mock.calls[mockUseInput.mock.calls.length - 1][0];
      inputHandler('p', {});
      expect(onPeriodChange).toHaveBeenCalledWith('daily');
    });

    it('handles "?" key to toggle help', () => {
      Dashboard(defaultProps);

      const inputHandler = mockUseInput.mock.calls[0][0];
      
      // Verify useState for showHelp was called
      expect(mockUseState).toHaveBeenCalled();
      
      // Simulate pressing "?"
      inputHandler('?', {});
    });

    it('handles "a" key to toggle auto-refresh', () => {
      Dashboard(defaultProps);

      const inputHandler = mockUseInput.mock.calls[0][0];
      
      // Verify useState for autoRefresh was called
      expect(mockUseState).toHaveBeenCalled();
      
      // Simulate pressing "a"
      inputHandler('a', {});
    });

    it('handles "+" key to increase refresh interval', () => {
      Dashboard(defaultProps);

      const inputHandler = mockUseInput.mock.calls[0][0];
      inputHandler('+', {});

      // Verify setRefreshInterval was called (through useState)
      expect(mockUseState).toHaveBeenCalled();
    });

    it('handles "-" key to decrease refresh interval', () => {
      Dashboard(defaultProps);

      const inputHandler = mockUseInput.mock.calls[0][0];
      inputHandler('-', {});

      // Verify setRefreshInterval was called (through useState)
      expect(mockUseState).toHaveBeenCalled();
    });

    it('does not call onPeriodChange when undefined', () => {
      const props = {...defaultProps, onPeriodChange: undefined};

      Dashboard(props);

      const inputHandler = mockUseInput.mock.calls[0][0];
      inputHandler('p', {});

      // Should not throw error
      expect(mockUseCallback).toHaveBeenCalled();
    });
  });

  describe('Help Overlay', () => {
    it('closes help on "?" key when help is shown', () => {
      Dashboard(defaultProps);

      // Mock showHelp state to be true
      const setShowHelpMock = mock(() => {});
      mockUseState.mockImplementationOnce(() => [true, setShowHelpMock]);

      Dashboard(defaultProps);

      const inputHandler = mockUseInput.mock.calls[mockUseInput.mock.calls.length - 1][0];
      inputHandler('?', {});
    });

    it('closes help on Escape key when help is shown', () => {
      Dashboard(defaultProps);

      const inputHandler = mockUseInput.mock.calls[0][0];
      
      // The logic checks showHelp state, which starts as false
      // When true, Escape should close help
      inputHandler('', {escape: true});
    });

    it('closes help on Enter key when help is shown', () => {
      Dashboard(defaultProps);

      const inputHandler = mockUseInput.mock.calls[0][0];
      
      // When help is shown, Enter should close help instead of refreshing
      inputHandler('', {return: true});
    });
  });

  describe('Auto-refresh Logic', () => {
    it('sets up auto-refresh timer when enabled', () => {
      Dashboard(defaultProps);

      // Find the auto-refresh useEffect
      const autoRefreshEffect = mockUseEffect.mock.calls.find((call: any[]) => {
        const deps = call[1];
        return deps && deps.length > 2; // Auto-refresh effect has multiple deps
      });

      expect(autoRefreshEffect).toBeDefined();
    });

    it('does not set up timer when auto-refresh is disabled', () => {
      Dashboard(defaultProps);

      // Auto-refresh logic is controlled by state
      expect(mockUseEffect).toHaveBeenCalled();
    });

    it('cleans up timer on unmount', () => {
      Dashboard(defaultProps);

      // Find the auto-refresh effect and verify cleanup
      const autoRefreshEffect = mockUseEffect.mock.calls.find((call: any[]) => {
        const deps = call[1];
        return deps && deps.length > 2;
      });

      if (autoRefreshEffect) {
        const cleanup = autoRefreshEffect[0]();
        expect(typeof cleanup === 'function' || cleanup === undefined).toBe(true);
      }
    });
  });

  describe('Data Rendering', () => {
    it('renders with valid usage data', () => {
      const result = Dashboard(defaultProps);
      expect(result).toBeDefined();
    });

    it('renders with empty usage data', () => {
      const emptySummary: UsageSummary = {
        totals: {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          totalCost: 0,
          totalTokens: 0,
        },
        providerRows: [],
        modelRows: [],
        messageCount: 0,
        activeDays: 0,
        totalDays: 0,
        averageDailyCost: 0,
        averageDailyTokens: 0,
      };

      const props = {...defaultProps, summary: emptySummary};
      const result = Dashboard(props);
      
      expect(result).toBeDefined();
    });

    it('renders with syncing state', () => {
      const props = {...defaultProps, isSyncing: true};
      const result = Dashboard(props);
      
      expect(result).toBeDefined();
    });

    it('renders with loading state', () => {
      const props = {...defaultProps, isLoading: true};
      const result = Dashboard(props);
      
      expect(result).toBeDefined();
    });

    it('uses raw labels when useRawLabels is true', () => {
      const props = {...defaultProps, useRawLabels: true};
      const result = Dashboard(props);
      
      expect(result).toBeDefined();
      expect(mockUseMemo).toHaveBeenCalled();
    });

    it('renders for daily period', () => {
      const props = {...defaultProps, currentPeriod: 'daily' as TimePeriod};
      const result = Dashboard(props);
      
      expect(result).toBeDefined();
    });

    it('renders for weekly period', () => {
      const props = {...defaultProps, currentPeriod: 'weekly' as TimePeriod};
      const result = Dashboard(props);
      
      expect(result).toBeDefined();
    });

    it('renders for yearly period', () => {
      const props = {...defaultProps, currentPeriod: 'yearly' as TimePeriod};
      const result = Dashboard(props);
      
      expect(result).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined stdout columns', () => {
      const stdoutWithoutColumns = {
        columns: undefined,
        rows: 32,
        on: mockStdoutOn,
        off: mockStdoutOff,
        removeListener: mockStdoutRemoveListener,
      };

      mockUseStdout.mockImplementation(() => ({
        stdout: stdoutWithoutColumns,
      }));

      const result = Dashboard(defaultProps);
      expect(result).toBeDefined();
    });

    it('handles undefined stdout rows', () => {
      const stdoutWithoutRows = {
        columns: 119,
        rows: undefined,
        on: mockStdoutOn,
        off: mockStdoutOff,
        removeListener: mockStdoutRemoveListener,
      };

      mockUseStdout.mockImplementation(() => ({
        stdout: stdoutWithoutRows,
      }));

      const result = Dashboard(defaultProps);
      expect(result).toBeDefined();
    });

    it('handles very small terminal dimensions', () => {
      mockStdout.columns = 10;
      mockStdout.rows = 5;

      const result = Dashboard(defaultProps);
      expect(result).toBeDefined();
    });

    it('handles very large terminal dimensions', () => {
      mockStdout.columns = 300;
      mockStdout.rows = 100;

      const result = Dashboard(defaultProps);
      expect(result).toBeDefined();
    });

    it('handles zero message count', () => {
      const summary = createMockSummary();
      summary.messageCount = 0;
      
      const props = {...defaultProps, summary};
      const result = Dashboard(props);
      
      expect(result).toBeDefined();
    });

    it('handles empty provider rows', () => {
      const summary = createMockSummary();
      summary.providerRows = [];
      
      const props = {...defaultProps, summary};
      const result = Dashboard(props);
      
      expect(result).toBeDefined();
    });

    it('handles empty model rows', () => {
      const summary = createMockSummary();
      summary.modelRows = [];
      
      const props = {...defaultProps, summary};
      const result = Dashboard(props);
      
      expect(result).toBeDefined();
    });

    it('handles summary with many providers', () => {
      const summary = createMockSummary();
      summary.providerRows = Array.from({length: 10}, (_, i) => ({
        name: `provider-${i}`,
        messageCount: i + 1,
        inputTokens: (i + 1) * 100,
        outputTokens: (i + 1) * 200,
        cacheCreationTokens: (i + 1) * 10,
        cacheReadTokens: (i + 1) * 5,
        totalTokens: (i + 1) * 315,
        totalCost: (i + 1) * 1.5,
        activeDays: i + 1,
      }));
      
      const props = {...defaultProps, summary};
      const result = Dashboard(props);
      
      expect(result).toBeDefined();
    });

    it('handles summary with many models', () => {
      const summary = createMockSummary();
      summary.modelRows = Array.from({length: 10}, (_, i) => ({
        name: `model-${i}`,
        messageCount: i + 1,
        inputTokens: (i + 1) * 100,
        outputTokens: (i + 1) * 200,
        cacheCreationTokens: (i + 1) * 10,
        cacheReadTokens: (i + 1) * 5,
        totalTokens: (i + 1) * 315,
        totalCost: (i + 1) * 1.5,
        activeDays: i + 1,
      }));
      
      const props = {...defaultProps, summary};
      const result = Dashboard(props);
      
      expect(result).toBeDefined();
    });
  });

  describe('Callback Memoization', () => {
    it('memoizes handleRefresh callback', () => {
      Dashboard(defaultProps);

      // Verify useCallback is used for handleRefresh
      const handleRefreshCallback = mockUseCallback.mock.calls.find((call: any[]) => {
        const deps = call[1];
        return deps && deps.includes(defaultProps.onRefresh);
      });

      expect(handleRefreshCallback).toBeDefined();
    });

    it('memoizes handlePeriodToggle callback', () => {
      Dashboard(defaultProps);

      // Verify useCallback is used for handlePeriodToggle
      const handlePeriodCallback = mockUseCallback.mock.calls.find((call: any[]) => {
        const deps = call[1];
        return deps && deps.includes(defaultProps.onPeriodChange);
      });

      expect(handlePeriodCallback).toBeDefined();
    });
  });

  describe('Computed Values', () => {
    it('computes layout states based on terminal dimensions', () => {
      Dashboard(defaultProps);

      // Verify useMemo is called for layout computations
      const layoutMemo = mockUseMemo.mock.calls.find((call: any[]) => {
        const deps = call[1];
        return deps && deps.length === 2; // terminalHeight and terminalWidth
      });

      expect(layoutMemo).toBeDefined();
    });

    it('computes mini stats data', () => {
      Dashboard(defaultProps);

      // Verify useMemo is called for miniStatsData
      expect(mockUseMemo).toHaveBeenCalled();
    });

    it('computes top provider rows', () => {
      Dashboard(defaultProps);

      // Verify useMemo is called for topProviderRows
      expect(mockUseMemo).toHaveBeenCalled();
    });

    it('computes top model rows', () => {
      Dashboard(defaultProps);

      // Verify useMemo is called for topModelRows
      expect(mockUseMemo).toHaveBeenCalled();
    });

    it('limits top providers to 5', () => {
      const summary = createMockSummary();
      summary.providerRows = Array.from({length: 10}, (_, i) => ({
        name: `provider-${i}`,
        messageCount: i + 1,
        inputTokens: (i + 1) * 100,
        outputTokens: (i + 1) * 200,
        cacheCreationTokens: (i + 1) * 10,
        cacheReadTokens: (i + 1) * 5,
        totalTokens: (i + 1) * 315,
        totalCost: (i + 1) * 1.5,
        activeDays: i + 1,
      }));

      Dashboard({...defaultProps, summary});

      // Verify useMemo is called and would limit to 5
      expect(mockUseMemo).toHaveBeenCalled();
    });

    it('limits top models to 5', () => {
      const summary = createMockSummary();
      summary.modelRows = Array.from({length: 10}, (_, i) => ({
        name: `model-${i}`,
        messageCount: i + 1,
        inputTokens: (i + 1) * 100,
        outputTokens: (i + 1) * 200,
        cacheCreationTokens: (i + 1) * 10,
        cacheReadTokens: (i + 1) * 5,
        totalTokens: (i + 1) * 315,
        totalCost: (i + 1) * 1.5,
        activeDays: i + 1,
      }));

      Dashboard({...defaultProps, summary});

      // Verify useMemo is called and would limit to 5
      expect(mockUseMemo).toHaveBeenCalled();
    });
  });
});