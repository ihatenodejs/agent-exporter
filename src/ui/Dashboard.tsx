import chalk from 'chalk';
import {Box, Text, useApp, useInput, useStdout} from 'ink';
import {useState, useEffect, useCallback, useMemo} from 'react';

import {Table, type TableRow} from './Table';
import {getModelDisplayName} from '../core/database/model-labels';

import type {TimePeriod} from '../core/date-utils';
import type {UsageSummary} from '../core/statistics';
import type {ReactElement} from 'react';

const integerFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCount = (value: number): string =>
  value === 0 ? chalk.gray('0') : chalk.white(integerFormatter.format(value));

const formatTokens = (value: number): string =>
  value === 0 ? chalk.gray('0') : chalk.yellow(integerFormatter.format(value));

const formatCurrency = (value: number): string =>
  value === 0
    ? chalk.gray(currencyFormatter.format(0))
    : chalk.green(currencyFormatter.format(value));

type LayoutKey = '3x1' | '2x2' | '1x3';

interface LayoutOption {
  key: LayoutKey;
  minWidth: number;
  minHeight: number;
  label: string;
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    key: '3x1',
    minWidth: 171,
    minHeight: 40,
    label: '3x1 (wide)',
  },
  {
    key: '2x2',
    minWidth: 119,
    minHeight: 32,
    label: '2x2 (balanced)',
  },
  {
    key: '1x3',
    minWidth: 72,
    minHeight: 50,
    label: '1x3 (tall)',
  },
];

const DEFAULT_LAYOUT = LAYOUT_OPTIONS[1];

interface MiniStatsRow extends TableRow {
  Metric: string;
  Value: string;
}

interface MiniUsageRow extends TableRow {
  Name: string;
  Cost: string;
  Tokens: string;
}

interface MiniTableSection {
  key: string;
  title?: string;
  rowWidth?: string;
  content: ReactElement;
}

interface DashboardProps {
  readonly summary: UsageSummary;
  readonly rangeDescription: string;
  readonly useRawLabels?: boolean;
  readonly onRefresh: () => void;
  readonly onPeriodChange?: (period: TimePeriod) => void;
  readonly currentPeriod?: TimePeriod;
  readonly onExit: () => void;
  readonly lastUpdated: Date;
}

export const Dashboard = ({
  summary,
  rangeDescription,
  useRawLabels = false,
  onRefresh,
  onPeriodChange,
  currentPeriod = 'monthly',
  onExit,
  lastUpdated,
}: DashboardProps): ReactElement => {
  const {exit} = useApp();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  const [timeUntilRefresh, setTimeUntilRefresh] = useState(refreshInterval);
  const [showHelp, setShowHelp] = useState(false);
  const {stdout} = useStdout();
  const [terminalSize, setTerminalSize] = useState(() => ({
    width: stdout.columns || DEFAULT_LAYOUT.minWidth,
    height: stdout.rows || DEFAULT_LAYOUT.minHeight,
  }));
  const {width: terminalWidth, height: terminalHeight} = terminalSize;

  const layoutStates = useMemo(() => {
    return LAYOUT_OPTIONS.map((option) => {
      const widthShortfall = Math.max(0, option.minWidth - terminalWidth);
      const heightShortfall = Math.max(0, option.minHeight - terminalHeight);
      return {
        ...option,
        widthShortfall,
        heightShortfall,
        fits: widthShortfall === 0 && heightShortfall === 0,
        distance: widthShortfall + heightShortfall,
      };
    });
  }, [terminalHeight, terminalWidth]);
  const activeLayoutInfo = layoutStates.find((layout) => layout.fits);
  const hasActiveLayout = Boolean(activeLayoutInfo);
  const isWideLayout = activeLayoutInfo?.key === '3x1';
  const isGridLayout = activeLayoutInfo?.key === '2x2';

  const handleRefresh = useCallback(() => {
    onRefresh();
    setTimeUntilRefresh(refreshInterval);
  }, [onRefresh, refreshInterval]);

  const handlePeriodToggle = useCallback(() => {
    if (!onPeriodChange) return;

    const periods: TimePeriod[] = ['daily', 'weekly', 'monthly', 'yearly'];
    const currentIndex = periods.indexOf(currentPeriod);
    const nextIndex = (currentIndex + 1) % periods.length;
    const nextPeriod = periods[nextIndex];
    onPeriodChange(nextPeriod);
  }, [onPeriodChange, currentPeriod]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      onExit();
      exit();
      return;
    }

    if (showHelp) {
      if (input === '?' || key.escape || key.return) {
        setShowHelp(false);
      }
      return;
    }

    if (key.return) {
      handleRefresh();
    } else if (input === 'r') {
      handleRefresh();
    } else if (input === 'a') {
      setAutoRefresh((prev) => !prev);
    } else if (input === '+') {
      const newInterval = Math.min(300, refreshInterval + 10);
      setRefreshInterval(newInterval);
      setTimeUntilRefresh(newInterval);
    } else if (input === '-') {
      const newInterval = Math.max(10, refreshInterval - 10);
      setRefreshInterval(newInterval);
      setTimeUntilRefresh(newInterval);
    } else if (input === 'p') {
      handlePeriodToggle();
    } else if (input === '?') {
      setShowHelp(true);
    }
  });

  useEffect(() => {
    const handleResize = (): void => {
      setTerminalSize({
        width: stdout.columns || DEFAULT_LAYOUT.minWidth,
        height: stdout.rows || DEFAULT_LAYOUT.minHeight,
      });
    };

    handleResize();
    stdout.on('resize', handleResize);

    return () => {
      stdout.off('resize', handleResize);
      stdout.removeListener('resize', handleResize);
    };
  }, [stdout]);

  useEffect(() => {
    if (!autoRefresh || !hasActiveLayout) {
      return;
    }

    const timer = setInterval(() => {
      setTimeUntilRefresh((prev) => {
        if (prev <= 1) {
          handleRefresh();
          return refreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRefresh, hasActiveLayout, refreshInterval, handleRefresh]);

  const hasUsage = summary.messageCount > 0;
  const isDailyPeriod = currentPeriod === 'daily';
  const miniTableGap = isWideLayout ? 2 : 1;
  const quickStatsGap = isWideLayout ? 2 : 1;

  const headerCard = (
    withMarginBottom: boolean,
    includeTotals: boolean,
  ): ReactElement => (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={0}
      marginBottom={withMarginBottom ? 1 : 0}
    >
      <Box
        flexDirection="row"
        justifyContent="space-between"
        marginBottom={1}
      >
        <Text
          color="cyanBright"
          bold
        >
          Agent Exporter
        </Text>
        <Text color="gray">Updated {lastUpdated.toLocaleTimeString()}</Text>
      </Box>
      <Box
        flexDirection="row"
        justifyContent="space-between"
        marginBottom={1}
      >
        <Text color="magentaBright">{rangeDescription}</Text>
        <Text color="gray">
          Period:{' '}
          {chalk.bold(
            currentPeriod.charAt(0).toUpperCase() + currentPeriod.slice(1),
          )}
        </Text>
      </Box>
      <Box
        flexDirection="row"
        justifyContent="space-between"
      >
        <Text color="gray">
          Auto-refresh: {autoRefresh ? chalk.green('ON') : chalk.red('OFF')} (
          {refreshInterval}s)
        </Text>
        <Text color="gray">
          Next refresh: {autoRefresh ? `${timeUntilRefresh}s` : 'paused'}
        </Text>
      </Box>
      {includeTotals ? (
        <Box
          flexDirection="column"
          marginTop={1}
        >
          <Text
            color="greenBright"
            bold
          >
            {`Total Cost: ${currencyFormatter.format(summary.totals.totalCost)}`}
          </Text>
          <Text
            color="cyan"
            bold
          >
            {`Total Tokens: ${integerFormatter.format(summary.totals.totalTokens)}`}
          </Text>
          {!isDailyPeriod ? (
            <>
              <Text
                color="yellowBright"
                bold
              >
                {`Avg Daily Cost: ${currencyFormatter.format(summary.averageDailyCost)}`}
              </Text>
              <Text
                color="magenta"
                bold
              >
                {`Avg Daily Tokens: ${decimalFormatter.format(summary.averageDailyTokens)}`}
              </Text>
            </>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );

  const headerPanelGrid = headerCard(false, true);
  const headerPanelStacked = headerCard(false, true);

  const controlsCard = (withMarginBottom: boolean): ReactElement => (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="blue"
      paddingX={1}
      paddingY={0}
      marginBottom={withMarginBottom ? 1 : 0}
    >
      <Box
        flexDirection="row"
        justifyContent="space-between"
        marginBottom={1}
      >
        <Text
          color="blueBright"
          bold
        >
          Controls
        </Text>
        <Text color="gray">Press keys to interact</Text>
      </Box>
      <Box flexDirection="column">
        <Text color="cyan">
          {chalk.bold('Enter')} / {chalk.bold('r')} Refresh{'   '}
          {chalk.bold('a')} Auto-refresh:{' '}
          {autoRefresh ? chalk.green('ON') : chalk.red('OFF')}
        </Text>
        <Text color="magenta">
          {chalk.bold('+')} / {chalk.bold('-')} Interval:{' '}
          {chalk.bold(`${refreshInterval}s`)}
        </Text>
        <Text color="yellow">
          {chalk.bold('p')} Cycle period →{' '}
          {chalk.bold(
            currentPeriod.charAt(0).toUpperCase() + currentPeriod.slice(1),
          )}
        </Text>
        <Text color="white">{chalk.bold('?')} Toggle help</Text>
        <Text color="red">{chalk.bold('Ctrl+C')} Exit</Text>
      </Box>
    </Box>
  );

  const helpOverlay = (): ReactElement => (
    <Box
      flexDirection="column"
      paddingX={1}
      paddingY={1}
    >
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
        paddingY={0}
      >
        <Text
          color="yellowBright"
          bold
        >
          Help & Shortcuts
        </Text>
        <Text color="gray">
          Use these keys to control the dashboard and understand the live data.
        </Text>
        <Box
          flexDirection="column"
          marginTop={1}
        >
          <Text color="cyan">
            {chalk.bold('Enter')} / {chalk.bold('r')} Refresh data immediately
          </Text>
          <Text color="magenta">
            {chalk.bold('+')} / {chalk.bold('-')} Adjust refresh interval
          </Text>
          <Text color="yellow">
            {chalk.bold('a')} Toggle auto-refresh →{' '}
            {autoRefresh ? chalk.green('ON') : chalk.red('OFF')}
          </Text>
          <Text color="blueBright">
            {chalk.bold('p')} Cycle time period (daily → weekly → monthly →
            yearly)
          </Text>
          <Text color="white">
            {chalk.bold('?')} Show or hide this help view
          </Text>
          <Text color="red">{chalk.bold('Ctrl+C')} Exit the dashboard</Text>
        </Box>
        <Box
          flexDirection="column"
          marginTop={1}
        >
          <Text color="gray">
            Auto-refresh runs every {refreshInterval}s while enabled (next
            refresh in {autoRefresh ? `${timeUntilRefresh}s` : 'paused'}).
          </Text>
          <Text color="gray">
            Press {chalk.bold('?')}, {chalk.bold('Esc')}, or{' '}
            {chalk.bold('Enter')} to close help.
          </Text>
        </Box>
      </Box>
    </Box>
  );

  const miniStatsData = useMemo<MiniStatsRow[]>(() => {
    const {totals, messageCount, activeDays} = summary;
    const rows: MiniStatsRow[] = [
      {
        Metric: chalk.bold('Total Cost'),
        Value: formatCurrency(totals.totalCost),
      },
      {
        Metric: chalk.bold('Total Tokens'),
        Value: formatTokens(totals.totalTokens),
      },
      {
        Metric: chalk.bold('Messages'),
        Value: formatCount(messageCount),
      },
    ];
    if (!isDailyPeriod) {
      rows.push({
        Metric: chalk.bold('Active Days'),
        Value: formatCount(activeDays),
      });
    }
    return rows;
  }, [summary, isDailyPeriod]);

  const topProviderRows = useMemo<MiniUsageRow[]>(() => {
    if (summary.providerRows.length === 0) {
      return [];
    }

    return [...summary.providerRows]
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 5)
      .map((row) => ({
        Name: chalk.bold(row.name),
        Cost: formatCurrency(row.totalCost),
        Tokens: formatTokens(row.totalTokens),
      }));
  }, [summary]);

  const topModelRows = useMemo<MiniUsageRow[]>(() => {
    if (summary.modelRows.length === 0) {
      return [];
    }

    return [...summary.modelRows]
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 5)
      .map((row) => {
        const displayName = useRawLabels
          ? row.name
          : getModelDisplayName(row.name);

        return {
          Name: chalk.bold(displayName),
          Cost: formatCurrency(row.totalCost),
          Tokens: formatTokens(row.totalTokens),
        };
      });
  }, [summary, useRawLabels]);

  const miniTableSections: MiniTableSection[] = [
    {
      key: 'quick-stats-table',
      title: '▸ Quick Stats',
      rowWidth: '30%',
      content: <Table data={miniStatsData} />,
    },
    {
      key: 'top-providers-table',
      title: '▸ Top Providers',
      rowWidth: '35%',
      content:
        topProviderRows.length > 0 ? (
          <Table data={topProviderRows} />
        ) : (
          <Text color="gray">No provider activity</Text>
        ),
    },
    {
      key: 'top-models-table',
      title: '▸ Top Models',
      rowWidth: '35%',
      content:
        topModelRows.length > 0 ? (
          <Table data={topModelRows} />
        ) : (
          <Text color="gray">No model activity</Text>
        ),
    },
  ];

  let miniTablesContent: ReactElement;

  if (isWideLayout) {
    miniTablesContent = (
      <Box
        flexDirection="row"
        marginBottom={1}
      >
        {miniTableSections.map((section, index) => (
          <Box
            key={section.key}
            flexDirection="column"
            flexGrow={1}
            marginRight={
              index < miniTableSections.length - 1 ? miniTableGap : 0
            }
            width={section.rowWidth}
          >
            {section.title ? (
              <Text
                color="blueBright"
                bold
              >
                {section.title}
              </Text>
            ) : null}
            {section.content}
          </Box>
        ))}
      </Box>
    );
  } else if (isGridLayout) {
    const gridSections: MiniTableSection[] = [
      {
        key: 'dashboard-header-panel',
        content: headerPanelGrid,
      },
      {
        key: 'controls-panel-grid',
        content: controlsCard(false),
      },
      ...miniTableSections,
    ];

    const gridRows: MiniTableSection[][] = [];
    for (let index = 0; index < gridSections.length; index += 2) {
      gridRows.push(gridSections.slice(index, index + 2));
    }

    miniTablesContent = (
      <Box
        flexDirection="column"
        marginBottom={1}
      >
        {gridRows.map((rowSections, rowIndex) => (
          <Box
            key={`mini-table-row-${rowIndex}`}
            flexDirection="row"
            marginBottom={rowIndex < gridRows.length - 1 ? miniTableGap : 0}
          >
            {rowSections.map((section, sectionIndex) => (
              <Box
                key={section.key}
                flexDirection="column"
                flexGrow={1}
                marginRight={
                  sectionIndex < rowSections.length - 1 ? miniTableGap : 0
                }
                width="50%"
              >
                {section.title ? (
                  <Text
                    color="blueBright"
                    bold
                  >
                    {section.title}
                  </Text>
                ) : null}
                {section.content}
              </Box>
            ))}
            {rowSections.length === 1 ? (
              <Box
                key={`mini-table-row-${rowIndex}-placeholder`}
                flexDirection="column"
                flexGrow={1}
                width="50%"
              />
            ) : null}
          </Box>
        ))}
      </Box>
    );
  } else {
    const stackedSections: MiniTableSection[] = [
      {
        key: 'dashboard-header-panel-stacked',
        content: headerPanelStacked,
      },
      {
        key: 'controls-panel-stacked',
        content: controlsCard(false),
      },
      ...miniTableSections,
    ];

    miniTablesContent = (
      <Box
        flexDirection="column"
        marginBottom={1}
      >
        {stackedSections.map((section, index) => (
          <Box
            key={section.key}
            flexDirection="column"
            marginBottom={index < stackedSections.length - 1 ? miniTableGap : 0}
          >
            {section.title ? (
              <Text
                color="blueBright"
                bold
              >
                {section.title}
              </Text>
            ) : null}
            {section.content}
          </Box>
        ))}
      </Box>
    );
  }

  if (showHelp) {
    return helpOverlay();
  }

  if (!activeLayoutInfo) {
    const describeShortfall = (
      count: number,
      unit: 'column' | 'row',
    ): string => {
      const suffix = count === 1 ? unit : `${unit}s`;
      return `${count === 0 ? '0' : `+${count}`} ${suffix}`;
    };

    const sortedLayouts = [...layoutStates].sort((a, b) => {
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      if (a.widthShortfall !== b.widthShortfall) {
        return a.widthShortfall - b.widthShortfall;
      }
      return a.heightShortfall - b.heightShortfall;
    });

    return (
      <Box
        flexDirection="column"
        paddingX={1}
        paddingY={1}
      >
        <Text
          color="redBright"
          bold
        >
          Terminal too small to display dashboard.
        </Text>
        <Text color="gray">
          Current size: {terminalWidth}×{terminalHeight}. Try one of these
          layouts (sorted by distance):
        </Text>
        {sortedLayouts.map((layout) => (
          <Text
            key={layout.key}
            color="gray"
          >
            {layout.label} requires {layout.minWidth}×{layout.minHeight} → needs{' '}
            {describeShortfall(layout.widthShortfall, 'column')},{' '}
            {describeShortfall(layout.heightShortfall, 'row')} (distance
            cols+rows {layout.distance})
          </Text>
        ))}
        <Text color="gray">
          Increase columns or rows until a layout requirement is met; the view
          will refresh automatically.
        </Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      paddingY={1}
    >
      {/* Agent Exporter Header & Controls */}
      {isWideLayout ? (
        <Box
          flexDirection="row"
          marginBottom={1}
        >
          <Box
            flexDirection="column"
            flexGrow={1}
            marginRight={miniTableGap}
          >
            {headerCard(false, false)}
          </Box>
          <Box
            flexDirection="column"
            flexGrow={1}
          >
            {controlsCard(false)}
          </Box>
        </Box>
      ) : null}

      {/* Quick Stats */}
      {isWideLayout ? (
        <Box
          flexDirection="row"
          marginBottom={1}
        >
          <Box
            flexDirection="column"
            marginRight={quickStatsGap}
            flexGrow={1}
          >
            <Text
              key="total-cost-main"
              color="greenBright"
              bold
            >
              {`Total Cost: ${currencyFormatter.format(summary.totals.totalCost)}`}
            </Text>
            {!isDailyPeriod && (
              <Text
                key="avg-daily-cost-main"
                color="yellowBright"
                bold
              >
                {`Avg Daily Cost: ${currencyFormatter.format(summary.averageDailyCost)}`}
              </Text>
            )}
          </Box>
          <Box
            flexDirection="column"
            flexGrow={1}
          >
            <Text
              key="total-tokens-main"
              color="cyan"
              bold
            >
              {`Total Tokens: ${integerFormatter.format(summary.totals.totalTokens)}`}
            </Text>
            {!isDailyPeriod && (
              <Text
                key="avg-daily-tokens-main"
                color="magenta"
                bold
              >
                {`Avg Daily Tokens: ${decimalFormatter.format(summary.averageDailyTokens)}`}
              </Text>
            )}
          </Box>
        </Box>
      ) : null}

      {/* Mini Tables */}
      {miniTablesContent}

      {!hasUsage ? (
        <Box marginTop={1}>
          <Text color="gray">
            No usage records found. Try syncing providers before running the
            live view.
          </Text>
        </Box>
      ) : null}
    </Box>
  );
};
