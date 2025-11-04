import {Box, Text} from 'ink';
import {useMemo} from 'react';

import type {ReactElement} from 'react';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- extends Record to satisfy table typing
export interface TableRow extends Record<string, string | number> {}

interface TableProps<T extends TableRow> {
  readonly data: T[];
}

// eslint-disable-next-line no-control-regex -- needed to strip ANSI color codes from table output
const ANSI_ESCAPE_PATTERN = /\u001B\[[0-9;]*m/g;

const stripAnsi = (value: string): string =>
  value.replace(ANSI_ESCAPE_PATTERN, '');

const formatValue = (value: string | number): string =>
  typeof value === 'string' ? value : value.toString();

export function Table<T extends TableRow>({
  data,
}: TableProps<T>): ReactElement | null {
  const preparedTable = useMemo(() => {
    if (data.length === 0) {
      return null;
    }

    const columns = Object.keys(data[0]) as (keyof T)[];
    const columnWidths = new Map<keyof T, number>();

    for (const column of columns) {
      const columnKey = column as string;
      let maxWidth = columnKey.length;

      for (const row of data) {
        const formattedValue = formatValue(row[column]);
        const cleanValue = stripAnsi(formattedValue);
        maxWidth = Math.max(maxWidth, cleanValue.length);
      }

      columnWidths.set(column, maxWidth);
    }

    const headerRow = columns
      .map((column) => {
        const width = columnWidths.get(column) ?? 0;
        const columnKey = column as string;
        return columnKey.padEnd(width);
      })
      .join('  ');

    const separator = columns
      .map((column) => {
        const width = columnWidths.get(column) ?? 0;
        return '─'.repeat(width);
      })
      .join('  ');

    const dataRows = data.map((row, index) => ({
      key: `row-${index}`,
      value: columns
        .map((column) => {
          const width = columnWidths.get(column) ?? 0;
          const formattedValue = formatValue(row[column]);
          const cleanValue = stripAnsi(formattedValue);
          const padding = width - cleanValue.length;
          return formattedValue + ' '.repeat(Math.max(0, padding));
        })
        .join('  '),
    }));

    return {
      headerRow,
      separator,
      dataRows,
    };
  }, [data]);

  if (!preparedTable) {
    return null;
  }

  const {headerRow, separator, dataRows} = preparedTable;

  return (
    <Box flexDirection="column">
      <Text
        bold
        dimColor
      >
        {headerRow}
      </Text>
      <Text dimColor>{separator}</Text>
      {dataRows.map((row) => (
        <Text key={row.key}>{row.value}</Text>
      ))}
    </Box>
  );
}
