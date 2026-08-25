import {Readable, Writable} from 'node:stream';

import {describe, expect, it} from 'bun:test';
import {render} from 'ink';

import {Dashboard} from '../Dashboard';

import type {AggregatedUsageRow, UsageSummary} from '../../core/statistics';
import type {ReactElement} from 'react';

class CaptureStream extends Writable {
  isTTY = true;
  output = '';

  constructor(
    readonly columns: number,
    readonly rows: number,
  ) {
    super();
  }

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.output += chunk.toString();
    callback();
  }
}

class InputStream extends Readable {
  isRaw = false;
  isTTY = true;

  override _read(): void {
    // Ink pushes input into this stream.
  }

  setRawMode(isRaw: boolean): this {
    this.isRaw = isRaw;
    return this;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }
}

const createUsageRow = (
  name: string,
  totalCost: number,
  totalTokens: number,
  messageCount = 1,
): AggregatedUsageRow => ({
  name,
  messageCount,
  inputTokens: totalTokens,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  totalTokens,
  totalCost,
  activeDays: 1,
});

const createUsageSummary = ({
  providerRows = [],
  modelRows = [],
}: {
  readonly providerRows?: AggregatedUsageRow[];
  readonly modelRows?: AggregatedUsageRow[];
} = {}): UsageSummary => {
  const allRows = modelRows.length > 0 ? modelRows : providerRows;
  const totalCost = allRows.reduce((sum, row) => sum + row.totalCost, 0);
  const totalTokens = allRows.reduce((sum, row) => sum + row.totalTokens, 0);
  const messageCount = allRows.reduce((sum, row) => sum + row.messageCount, 0);

  return {
    totals: {
      inputTokens: totalTokens,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalCost,
      totalTokens,
    },
    providerRows,
    modelRows,
    messageCount,
    activeDays: allRows.length > 0 ? 1 : 0,
    totalDays: 1,
    averageDailyCost: totalCost,
    averageDailyTokens: totalTokens,
  };
};

const dashboard = (
  summary: UsageSummary,
  useRawLabels = false,
  canNavigatePrevious = false,
  canNavigateNext = false,
): ReactElement => (
  <Dashboard
    summary={summary}
    rangeDescription="Today"
    useRawLabels={useRawLabels}
    onRefresh={() => undefined}
    onPeriodChange={() => undefined}
    onPeriodNavigate={() => undefined}
    canNavigatePrevious={canNavigatePrevious}
    canNavigateNext={canNavigateNext}
    currentPeriod="daily"
    onExit={() => undefined}
    lastUpdated={new Date('2026-08-25T12:00:00Z')}
  />
);

const renderDashboard = async (
  summary: UsageSummary,
  columns: number,
  rows: number,
  useRawLabels = false,
): Promise<string> => {
  const stdout = new CaptureStream(columns, rows);
  const instance = render(dashboard(summary, useRawLabels), {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: new InputStream() as unknown as NodeJS.ReadStream,
    interactive: false,
    patchConsole: false,
  });

  await instance.waitUntilRenderFlush();
  instance.unmount();
  await instance.waitUntilExit();
  instance.cleanup();
  return Bun.stripANSI(stdout.output);
};

const findChartTitleLine = (
  output: string,
  title: string,
): string | undefined =>
  output
    .split('\n')
    .find((line) => line.includes(title) && !line.includes('▸'));

describe('Dashboard period controls', () => {
  it('shows only the available adjacent period direction', async () => {
    const stdout = new CaptureStream(119, 42);
    const instance = render(dashboard(createUsageSummary(), false, true), {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: new InputStream() as unknown as NodeJS.ReadStream,
      interactive: false,
      patchConsole: false,
    });

    await instance.waitUntilRenderFlush();
    instance.unmount();
    await instance.waitUntilExit();
    instance.cleanup();

    expect(Bun.stripANSI(stdout.output)).toContain('<- Prev period');
  });

  it('labels combined navigation in keyboard order', async () => {
    const stdout = new CaptureStream(119, 42);
    const instance = render(
      dashboard(createUsageSummary(), false, true, true),
      {
        stdout: stdout as unknown as NodeJS.WriteStream,
        stdin: new InputStream() as unknown as NodeJS.ReadStream,
        interactive: false,
        patchConsole: false,
      },
    );

    await instance.waitUntilRenderFlush();
    instance.unmount();
    await instance.waitUntilExit();
    instance.cleanup();

    expect(Bun.stripANSI(stdout.output)).toContain('<-/-> Prev/Next period');
  });
});

describe('Dashboard charts', () => {
  it('moves the lone Models chart into the left chart panel', async () => {
    const summary = createUsageSummary({
      providerRows: [createUsageRow('anthropic', 1, 100)],
      modelRows: [
        createUsageRow('model-a', 0.75, 10),
        createUsageRow('model-b', 0.25, 90),
      ],
    });
    const output = await renderDashboard(summary, 119, 42, true);
    const modelsLine = findChartTitleLine(output, 'Models');

    expect(modelsLine).toBeDefined();
    const leftPanelWidth = Math.floor((119 - 2 - 1) / 2);
    expect(modelsLine?.indexOf('Models')).toBe(
      1 + Math.floor((leftPanelWidth - 'Models'.length) / 2),
    );
    expect(findChartTitleLine(output, 'Providers')).toBeUndefined();
  });

  it('places Providers and Models on one row below the statistics', async () => {
    const summary = createUsageSummary({
      providerRows: [
        createUsageRow('anthropic', 0.5, 100),
        createUsageRow('codex', 0.5, 100),
      ],
      modelRows: [
        createUsageRow('model-a', 0.5, 100),
        createUsageRow('model-b', 0.5, 100),
      ],
    });
    const output = await renderDashboard(summary, 119, 42, true);
    const lines = output.split('\n');
    const chartLineIndex = lines.findIndex(
      (line) =>
        line.includes('Providers') &&
        line.includes('Models') &&
        !line.includes('▸'),
    );
    const lastStatisticsHeading = lines.reduce(
      (lastIndex, line, index) =>
        line.includes('▸ Top Models') ? index : lastIndex,
      -1,
    );

    expect(chartLineIndex).toBeGreaterThan(lastStatisticsHeading);
  });

  it('uses cost percentages instead of token or message ratios', async () => {
    const summary = createUsageSummary({
      providerRows: [
        createUsageRow('anthropic', 75, 1, 99),
        createUsageRow('codex', 25, 999, 1),
      ],
      modelRows: [
        createUsageRow('model-a', 75, 1, 99),
        createUsageRow('model-b', 25, 999, 1),
      ],
    });
    const output = await renderDashboard(summary, 119, 42, true);

    expect(output).toContain('anthropic 75%');
    expect(output).toContain('codex 25%');
    expect(output).toContain('model-a 75%');
    expect(output).toContain('model-b 25%');
  });

  it('switches model chart labels between friendly and raw names', async () => {
    const summary = createUsageSummary({
      providerRows: [createUsageRow('codex', 1, 100)],
      modelRows: [createUsageRow('gpt-5', 1, 100)],
    });
    const friendlyOutput = await renderDashboard(summary, 119, 42);
    const rawOutput = await renderDashboard(summary, 119, 42, true);

    expect(friendlyOutput).toContain('GPT-5 100%');
    expect(rawOutput).toContain('gpt-5 100%');
    expect(rawOutput).not.toContain('GPT-5 100%');
  });

  it('hides Providers after rerendering to one provider without hiding Models', async () => {
    const twoProviders = createUsageSummary({
      providerRows: [
        createUsageRow('anthropic', 0.5, 100),
        createUsageRow('codex', 0.5, 100),
      ],
      modelRows: [createUsageRow('model-a', 1, 200)],
    });
    const oneProvider = createUsageSummary({
      providerRows: [createUsageRow('anthropic', 1, 200)],
      modelRows: [createUsageRow('model-a', 1, 200)],
    });
    const stdout = new CaptureStream(119, 42);
    const instance = render(dashboard(twoProviders, true), {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: new InputStream() as unknown as NodeJS.ReadStream,
      interactive: false,
      patchConsole: false,
      debug: true,
    });
    await instance.waitUntilRenderFlush();
    const firstOutput = stdout.output;

    instance.rerender(dashboard(oneProvider, true));
    await instance.waitUntilRenderFlush();
    instance.unmount();
    await instance.waitUntilExit();
    instance.cleanup();

    const output = Bun.stripANSI(stdout.output.slice(firstOutput.length));
    expect(findChartTitleLine(output, 'Providers')).toBeUndefined();
    expect(findChartTitleLine(output, 'Models')).toBeDefined();
  });

  it('uses the active dashboard at the 72x62 baseline without overflowing', async () => {
    const summary = createUsageSummary({
      providerRows: [createUsageRow('anthropic', 1, 100)],
      modelRows: [
        createUsageRow('model-a', 0.75, 75),
        createUsageRow('model-b', 0.25, 25),
      ],
    });
    const output = await renderDashboard(summary, 72, 62, true);
    const lines = output.split('\n');

    expect(output).toContain('Agent Exporter');
    expect(output).not.toContain('Terminal too small');
    expect(lines.every((line) => Bun.stringWidth(line) <= 72)).toBe(true);
  });
});
