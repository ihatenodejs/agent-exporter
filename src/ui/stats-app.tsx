import chalk from 'chalk';
import {Box, Text} from 'ink';

import {
  formatCount,
  formatTokens,
  formatTokensDecimal,
  formatCurrency,
  integerFormatter,
  decimalFormatter,
  currencyFormatter,
} from './formatters';
import {Table, type TableRow} from './Table';
import {getModelDisplayName} from '../core/database/model-labels';

import type {AggregatedUsageRow, UsageSummary} from '../core/statistics';
import type {ReactElement, ReactNode} from 'react';

const MAX_TABLE_ROWS = 10;

const formatCachePair = (creationTokens: number, readTokens: number): string =>
  `${formatTokens(creationTokens)}/${formatTokens(readTokens)}`;

interface UsageRow extends TableRow {
  Name: string;
  Messages: string;
  'Usage Days': string;
  Input: string;
  Output: string;
  'Cache W/R': string;
  Tokens: string;
  Cost: string;
}

interface BuildUsageRowOptions {
  readonly displayName?: string;
  readonly messageValue?: string;
}

const buildUsageRow = (
  row: AggregatedUsageRow,
  {displayName, messageValue}: BuildUsageRowOptions = {},
): UsageRow => ({
  Name: chalk.bold(displayName ?? row.name),
  Messages: messageValue ?? formatCount(row.messageCount),
  'Usage Days': formatCount(row.activeDays),
  Input: formatTokens(row.inputTokens),
  Output: formatTokens(row.outputTokens),
  'Cache W/R': formatCachePair(row.cacheCreationTokens, row.cacheReadTokens),
  Tokens: formatTokens(row.totalTokens),
  Cost: formatCurrency(row.totalCost),
});

interface SectionProps {
  readonly title: string;
  readonly children: ReactNode;
}

const Section = ({title, children}: SectionProps): ReactElement => (
  <Box
    flexDirection="column"
    marginBottom={1}
  >
    <Text
      color="blueBright"
      bold
    >
      {`▸ ${title}`}
    </Text>
    <Box marginTop={1}>{children}</Box>
  </Box>
);

interface StatsAppProps {
  readonly summary: UsageSummary;
  readonly periodLabel?: string;
  readonly rangeDescription: string;
  readonly useRawLabels?: boolean;
  readonly showHidden?: boolean;
}

interface TotalsTableRow extends TableRow {
  Metric: string;
  Value: string;
}

export const StatsApp = ({
  summary,
  periodLabel,
  rangeDescription,
  useRawLabels = false,
  showHidden = false,
}: StatsAppProps): ReactElement => {
  const hasUsage = summary.messageCount > 0;

  const isZeroUsageRow = (row: AggregatedUsageRow): boolean =>
    row.totalCost === 0 && row.totalTokens === 0;

  const splitRows = (
    rows: AggregatedUsageRow[],
  ): {visible: AggregatedUsageRow[]; hidden: AggregatedUsageRow[]} => {
    if (rows.length <= MAX_TABLE_ROWS) {
      return {visible: rows, hidden: []};
    }

    let visibleCount = MAX_TABLE_ROWS;
    while (
      visibleCount < rows.length &&
      !rows.slice(visibleCount).every(isZeroUsageRow)
    ) {
      visibleCount++;
    }

    const visible = rows.slice(0, visibleCount);
    const hidden = rows.slice(visibleCount);

    if (hidden.length > 0 && !hidden.every(isZeroUsageRow)) {
      return {visible: rows, hidden: []};
    }

    return {visible, hidden};
  };

  const zeroUsageProviderRows = summary.providerRows.filter(isZeroUsageRow);

  const baseProviderRows = showHidden
    ? summary.providerRows
    : summary.providerRows.filter((row) => !isZeroUsageRow(row));

  const {visible: providerRows, hidden: hiddenProviderRows} = showHidden
    ? {visible: baseProviderRows, hidden: [] as AggregatedUsageRow[]}
    : splitRows(baseProviderRows);
  const {visible: modelRows, hidden: hiddenModelRows} = showHidden
    ? {visible: summary.modelRows, hidden: [] as AggregatedUsageRow[]}
    : splitRows(summary.modelRows);

  const providersHidden = showHidden ? 0 : hiddenProviderRows.length;
  const zeroUsageProvidersHidden = showHidden
    ? 0
    : zeroUsageProviderRows.length;
  const modelsHidden = showHidden ? 0 : hiddenModelRows.length;

  const isDailyPeriod = periodLabel === 'Today';

  const totalsTableData: TotalsTableRow[] = [
    {
      Metric: chalk.bold('Input Tokens'),
      Value: formatTokens(summary.totals.inputTokens),
    },
    {
      Metric: chalk.bold('Output Tokens'),
      Value: formatTokens(summary.totals.outputTokens),
    },
    {
      Metric: chalk.bold('Cache (Write)'),
      Value: formatTokens(summary.totals.cacheCreationTokens),
    },
    {
      Metric: chalk.bold('Cache (Read)'),
      Value: formatTokens(summary.totals.cacheReadTokens),
    },
    {
      Metric: chalk.bold('Total Tokens'),
      Value: formatTokens(summary.totals.totalTokens),
    },
    ...(isDailyPeriod
      ? []
      : [
          {
            Metric: chalk.bold('Average Daily Tokens'),
            Value: formatTokensDecimal(summary.averageDailyTokens),
          },
        ]),
    {
      Metric: chalk.bold('Total Cost'),
      Value: formatCurrency(summary.totals.totalCost),
    },
    ...(isDailyPeriod
      ? []
      : [
          {
            Metric: chalk.bold('Average Daily Cost'),
            Value: formatCurrency(summary.averageDailyCost),
          },
        ]),
  ];

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      paddingY={1}
    >
      <Box
        flexDirection="column"
        marginBottom={1}
      >
        <Text
          color="cyanBright"
          bold
        >
          Agent Usage Overview
        </Text>
        {periodLabel ? <Text color="magentaBright">{periodLabel}</Text> : null}
        <Text>{chalk.cyan(rangeDescription)}</Text>
        <Text color="gray">
          {`Messages ${integerFormatter.format(summary.messageCount)} • Active days ${summary.activeDays}/${summary.totalDays}`}
        </Text>
      </Box>

      <Box
        flexDirection="column"
        marginBottom={1}
      >
        <Box>
          <Text
            color="greenBright"
            bold
          >
            {`Total Cost: ${currencyFormatter.format(summary.totals.totalCost)}`}
          </Text>
          {!isDailyPeriod && (
            <>
              <Text> </Text>
              <Text
                color="yellowBright"
                bold
              >
                {`Avg Daily Cost: ${currencyFormatter.format(summary.averageDailyCost)}`}
              </Text>
            </>
          )}
        </Box>
        <Box>
          <Text
            color="cyan"
            bold
          >
            {`Total Tokens: ${integerFormatter.format(summary.totals.totalTokens)}`}
          </Text>
          {!isDailyPeriod && (
            <>
              <Text> </Text>
              <Text
                color="magenta"
                bold
              >
                {`Avg Daily Tokens: ${decimalFormatter.format(summary.averageDailyTokens)}`}
              </Text>
            </>
          )}
        </Box>
      </Box>

      <Section title="Totals">
        <Table data={totalsTableData} />
      </Section>

      <Section title="Providers">
        {providerRows.length > 0 ? (
          <Box flexDirection="column">
            <Table
              data={providerRows.map((row) =>
                buildUsageRow(row, {
                  messageValue:
                    row.name === 'codex' || row.name === 'anthropic'
                      ? chalk.gray('-')
                      : undefined,
                }),
              )}
            />
            {providersHidden > 0 ? (
              <Text color="gray">
                {`+${providersHidden} more provider${providersHidden === 1 ? '' : 's'} hidden (use --show-hidden)`}
              </Text>
            ) : null}
            {zeroUsageProvidersHidden > 0 ? (
              <Text color="gray">
                {`+${zeroUsageProvidersHidden} more provider${zeroUsageProvidersHidden === 1 ? '' : 's'} hidden (use --show-hidden)`}
              </Text>
            ) : null}
          </Box>
        ) : (
          <Text color="gray">No provider activity for this range.</Text>
        )}
      </Section>

      <Section title="Models">
        {modelRows.length > 0 ? (
          <Box flexDirection="column">
            <Table
              data={modelRows.map((row) =>
                buildUsageRow(row, {
                  displayName: useRawLabels
                    ? row.name
                    : getModelDisplayName(row.name),
                }),
              )}
            />
            {modelsHidden > 0 ? (
              <Text color="gray">
                {`+${modelsHidden} more model${modelsHidden === 1 ? '' : 's'} hidden (use --show-hidden)`}
              </Text>
            ) : null}
          </Box>
        ) : (
          <Text color="gray">No model activity for this range.</Text>
        )}
      </Section>

      {!hasUsage ? (
        <Box marginTop={1}>
          <Text color="gray">
            No usage records found. Try syncing providers before running the
            stats command.
          </Text>
        </Box>
      ) : null}
    </Box>
  );
};
