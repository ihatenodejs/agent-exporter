import {Writable} from 'node:stream';

import {describe, expect, it} from 'bun:test';
import {render, renderToString} from 'ink';

import {PieChart} from '../PieChart';

import type {PieChartSlice} from '../PieChart';

const hasTrueColor = Number(process.env.FORCE_COLOR) >= 3;

class CaptureStream extends Writable {
  columns = 120;
  rows = 80;
  isTTY = true;
  output = '';

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.output += chunk.toString();
    callback();
  }
}

const ANSI_ESCAPE = String.fromCharCode(0x1b);

const getChipColors = (output: string): string[] =>
  [
    ...output.matchAll(
      new RegExp(`${ANSI_ESCAPE}\\[38;2;(\\d+;\\d+;\\d+)m■`, 'g'),
    ),
  ].map((match) => match[1]);

const getColorByLabel = (output: string, label: string): string | undefined => {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(
    `\\u001B\\[38;2;(\\d+;\\d+;\\d+)m■[^\\n]*${escapedLabel}`,
  ).exec(output);
  return match?.[1];
};

const visibleLines = (output: string): string[] =>
  Bun.stripANSI(output).split('\n');

describe('PieChart', () => {
  it('preserves custom colors and generates distinct colors for other slices', () => {
    const output = renderToString(
      <PieChart
        width={80}
        slices={[
          {id: 'custom', label: 'Custom', value: 1, color: '#112233'},
          {id: 'generated-a', label: 'Generated A', value: 1},
          {id: 'generated-b', label: 'Generated B', value: 1},
        ]}
        showLegend
      />,
      {columns: 80},
    );
    const colors = getChipColors(output);
    if (!hasTrueColor) {
      expect(Bun.stripANSI(output)).toContain('■ Custom');
      expect(Bun.stripANSI(output)).toContain('■ Generated A');
      expect(Bun.stripANSI(output)).toContain('■ Generated B');
      return;
    }

    expect(output).toContain('\u001B[38;2;17;34;51m■');
    expect(colors).toHaveLength(3);
    expect(new Set(colors).size).toBe(3);
    expect(colors.filter((color) => color === '17;34;51')).toHaveLength(1);
  });

  it('keeps title and legend opt-in', () => {
    const withoutOptions = renderToString(
      <PieChart
        width={40}
        slices={[{label: 'Alpha', value: 1}]}
      />,
      {columns: 40},
    );
    const withTitle = renderToString(
      <PieChart
        width={40}
        title="Costs"
        slices={[{label: 'Alpha', value: 1}]}
      />,
      {columns: 40},
    );

    expect(Bun.stripANSI(withoutOptions)).not.toContain('Alpha');
    expect(Bun.stripANSI(withoutOptions)).not.toContain('Costs');
    expect(Bun.stripANSI(withTitle)).toContain('Costs');
    expect(Bun.stripANSI(withTitle)).not.toContain('Alpha');
  });

  it('renders bold labels followed by unbolded percentages', () => {
    const output = renderToString(
      <PieChart
        width={60}
        slices={[
          {label: 'Alpha', value: 75},
          {label: 'Beta', value: 25},
        ]}
        showLegend
        showPercentages
      />,
      {columns: 60},
    );
    if (!hasTrueColor) {
      expect(Bun.stripANSI(output)).toContain('Alpha 75%');
      expect(Bun.stripANSI(output)).toContain('Beta 25%');
      return;
    }

    expect(output).toContain('\u001B[1mAlpha\u001B[22m 75%');
    expect(output).toContain('\u001B[1mBeta\u001B[22m 25%');
    expect(output).not.toContain('\u001B[1m75%');
    expect(output).not.toContain('\u001B[1m25%');
  });

  it('excludes non-positive and non-finite slices from totals and legends', () => {
    const output = renderToString(
      <PieChart
        width={60}
        slices={[
          {label: 'Alpha', value: 75},
          {label: 'Beta', value: 25},
          {label: 'Zero', value: 0},
          {label: 'Negative', value: -10},
          {label: 'Infinite', value: Number.POSITIVE_INFINITY},
          {label: 'NaN', value: Number.NaN},
        ]}
        showLegend
        showPercentages
      />,
      {columns: 60},
    );
    const visible = Bun.stripANSI(output);

    expect(visible).toContain('Alpha 75%');
    expect(visible).toContain('Beta 25%');
    expect(visible).not.toContain('Zero');
    expect(visible).not.toContain('Negative');
    expect(visible).not.toContain('Infinite');
    expect(visible).not.toContain('NaN');
  });

  it('renders No data when no slice contributes a positive value', () => {
    const output = renderToString(
      <PieChart
        width={30}
        title="Costs"
        slices={[
          {label: 'Zero', value: 0},
          {label: 'Negative', value: -1},
        ]}
        showLegend
        showPercentages
      />,
      {columns: 30},
    );

    expect(Bun.stripANSI(output)).toContain('Costs');
    expect(Bun.stripANSI(output)).toContain('No data');
  });

  it('retains generated colors by identity across value and order changes', async () => {
    const stdout = new CaptureStream();
    const firstSlices: PieChartSlice[] = [
      {id: 'alpha-id', label: 'Alpha', value: 75},
      {id: 'beta-id', label: 'Beta', value: 25},
    ];
    const instance = render(
      <PieChart
        width={60}
        slices={firstSlices}
        showLegend
      />,
      {
        stdout: stdout as unknown as NodeJS.WriteStream,
        interactive: false,
        patchConsole: false,
        debug: true,
      },
    );
    await instance.waitUntilRenderFlush();
    const firstOutput = stdout.output;
    const firstAlpha = getColorByLabel(firstOutput, 'Alpha');
    const firstBeta = getColorByLabel(firstOutput, 'Beta');

    instance.rerender(
      <PieChart
        width={60}
        slices={[
          {id: 'beta-id', label: 'Beta', value: 80},
          {id: 'alpha-id', label: 'Alpha', value: 20},
        ]}
        showLegend
      />,
    );
    await instance.waitUntilRenderFlush();
    const secondOutput = stdout.output.slice(firstOutput.length);
    instance.unmount();
    await instance.waitUntilExit();
    instance.cleanup();

    if (!hasTrueColor) {
      expect(Bun.stripANSI(firstOutput)).toContain('■ Alpha');
      expect(Bun.stripANSI(firstOutput)).toContain('■ Beta');
      expect(Bun.stripANSI(secondOutput)).toContain('■ Alpha');
      expect(Bun.stripANSI(secondOutput)).toContain('■ Beta');
      return;
    }

    expect(firstAlpha).toBeDefined();
    expect(firstBeta).toBeDefined();
    expect(getColorByLabel(secondOutput, 'Alpha')).toBe(firstAlpha);
    expect(getColorByLabel(secondOutput, 'Beta')).toBe(firstBeta);
  });

  it('contains long labels below and above the side-layout threshold', () => {
    const slices: PieChartSlice[] = [
      {label: 'Alpha-abcdefghij', value: 50},
      {label: 'Beta-abcdefghijk', value: 50},
    ];
    const longestEntryWidth = 2 + Bun.stringWidth(slices[1].label) + 4;
    const sideThreshold = 16 + 2 + longestEntryWidth;

    for (const width of [sideThreshold - 1, sideThreshold]) {
      const output = renderToString(
        <PieChart
          width={width}
          slices={slices}
          showLegend
          showPercentages
        />,
        {columns: width},
      );
      const lines = visibleLines(output);

      expect(lines.every((line) => Bun.stringWidth(line) <= width)).toBe(true);
      expect(lines.some((line) => line.includes('Alpha-'))).toBe(true);
      expect(lines.some((line) => line.includes('Beta-'))).toBe(true);
    }
  });
});
