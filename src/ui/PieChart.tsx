import {Box, Text} from 'ink';
import {useMemo, useRef} from 'react';

import type {ReactElement} from 'react';

export interface PieChartSlice {
  readonly id?: string;
  readonly label: string;
  readonly value: number;
  readonly color?: string;
}

interface PieChartProps {
  readonly slices: readonly PieChartSlice[];
  readonly width: number;
  readonly title?: string;
  readonly showLegend?: boolean;
  readonly showPercentages?: boolean;
}

interface NormalizedSlice extends PieChartSlice {
  readonly identity: string;
}

interface ColoredSlice extends NormalizedSlice {
  readonly resolvedColor: string;
  readonly percentage: string;
}

interface RasterRun {
  readonly text: string;
  readonly foreground?: string;
  readonly background?: string;
}

const PREFERRED_DIAMETER = 16;
const GOLDEN_ANGLE = 137.507_764_050_037_85;
const GENERATED_SATURATION = 72;
const GENERATED_LIGHTNESS = 58;

const normalizeColor = (color: string): string => {
  const normalized = color.trim().toLowerCase();
  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(normalized);
  if (!shortHex) {
    return normalized;
  }

  return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`;
};

const hslToHex = (
  hue: number,
  saturation: number,
  lightness: number,
): string => {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const normalizedSaturation = saturation / 100;
  const normalizedLightness = lightness / 100;
  const chroma =
    (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const hueSegment = normalizedHue / 60;
  const intermediate = chroma * (1 - Math.abs((hueSegment % 2) - 1));

  let red = 0;
  let green = 0;
  let blue = 0;
  if (hueSegment < 1) {
    red = chroma;
    green = intermediate;
  } else if (hueSegment < 2) {
    red = intermediate;
    green = chroma;
  } else if (hueSegment < 3) {
    green = chroma;
    blue = intermediate;
  } else if (hueSegment < 4) {
    green = intermediate;
    blue = chroma;
  } else if (hueSegment < 5) {
    red = intermediate;
    blue = chroma;
  } else {
    red = chroma;
    blue = intermediate;
  }

  const offset = normalizedLightness - chroma / 2;
  const channelToHex = (channel: number): string =>
    Math.round((channel + offset) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`;
};

const formatPercentage = (value: number, total: number): string => {
  const percentage = Math.round((value / total) * 1000) / 10;
  return `${percentage.toFixed(1).replace(/\.0$/, '')}%`;
};

const getSliceAtSample = (
  slices: readonly ColoredSlice[],
  x: number,
  y: number,
  diameter: number,
): ColoredSlice | undefined => {
  const radius = diameter / 2;
  const deltaX = x + 0.5 - radius;
  const deltaY = y + 0.5 - radius;
  if (deltaX * deltaX + deltaY * deltaY > radius * radius) {
    return undefined;
  }

  let angle = Math.atan2(deltaX, -deltaY);
  if (angle < 0) {
    angle += Math.PI * 2;
  }
  const position = angle / (Math.PI * 2);

  let cumulative = 0;
  for (const slice of slices) {
    cumulative += slice.value;
    if (position < cumulative) {
      return slice;
    }
  }

  return slices.at(-1);
};

const createRasterRows = (
  slices: readonly ColoredSlice[],
  diameter: number,
): RasterRun[][] => {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const proportionalSlices = slices.map((slice) => ({
    ...slice,
    value: slice.value / total,
  }));
  const rows: RasterRun[][] = [];

  for (let y = 0; y < diameter; y += 2) {
    const runs: RasterRun[] = [];
    for (let x = 0; x < diameter; x += 1) {
      const upper = getSliceAtSample(proportionalSlices, x, y, diameter);
      const lower =
        y + 1 < diameter
          ? getSliceAtSample(proportionalSlices, x, y + 1, diameter)
          : undefined;

      let cell: RasterRun;
      if (!upper && !lower) {
        cell = {text: ' '};
      } else if (upper && !lower) {
        cell = {text: '▀', foreground: upper.resolvedColor};
      } else if (!upper && lower) {
        cell = {text: '▄', foreground: lower.resolvedColor};
      } else if (upper?.resolvedColor === lower?.resolvedColor) {
        cell = {text: '█', foreground: upper?.resolvedColor};
      } else {
        cell = {
          text: '▀',
          foreground: upper?.resolvedColor,
          background: lower?.resolvedColor,
        };
      }

      const previous = runs.at(-1);
      if (
        previous &&
        previous.foreground === cell.foreground &&
        previous.background === cell.background
      ) {
        runs[runs.length - 1] = {...previous, text: previous.text + cell.text};
      } else {
        runs.push(cell);
      }
    }
    rows.push(runs);
  }

  return rows;
};

export const PieChart = ({
  slices,
  width,
  title,
  showLegend = false,
  showPercentages = false,
}: PieChartProps): ReactElement => {
  const generatedColors = useRef(new Map<string, string>());
  const initialHue = useRef(Math.random() * 360);
  const generationIndex = useRef(0);
  const boundedWidth = Math.max(1, Math.floor(width));

  const normalizedSlices = useMemo<NormalizedSlice[]>(() => {
    const identityOccurrences = new Map<string, number>();

    return slices.flatMap((slice) => {
      if (!Number.isFinite(slice.value) || slice.value <= 0) {
        return [];
      }

      const baseIdentity = slice.id ?? slice.label;
      const occurrence = (identityOccurrences.get(baseIdentity) ?? 0) + 1;
      identityOccurrences.set(baseIdentity, occurrence);

      return [
        {
          ...slice,
          identity:
            occurrence === 1 ? baseIdentity : `${baseIdentity}#${occurrence}`,
        },
      ];
    });
  }, [slices]);

  const total = useMemo(
    () => normalizedSlices.reduce((sum, slice) => sum + slice.value, 0),
    [normalizedSlices],
  );

  const coloredSlices = useMemo<ColoredSlice[]>(() => {
    const customColors = new Set(
      normalizedSlices.flatMap((slice) =>
        slice.color ? [normalizeColor(slice.color)] : [],
      ),
    );

    return normalizedSlices.map((slice) => {
      if (slice.color) {
        return {
          ...slice,
          resolvedColor: slice.color,
          percentage: formatPercentage(slice.value, total),
        };
      }

      let resolvedColor = generatedColors.current.get(slice.identity);
      if (resolvedColor && customColors.has(normalizeColor(resolvedColor))) {
        resolvedColor = undefined;
      }

      if (!resolvedColor) {
        const occupiedColors = new Set(customColors);
        for (const [identity, generatedColor] of generatedColors.current) {
          if (identity !== slice.identity) {
            occupiedColors.add(normalizeColor(generatedColor));
          }
        }

        do {
          resolvedColor = hslToHex(
            initialHue.current + generationIndex.current * GOLDEN_ANGLE,
            GENERATED_SATURATION,
            GENERATED_LIGHTNESS,
          );
          generationIndex.current += 1;
        } while (occupiedColors.has(normalizeColor(resolvedColor)));

        generatedColors.current.set(slice.identity, resolvedColor);
      }

      return {
        ...slice,
        resolvedColor,
        percentage: formatPercentage(slice.value, total),
      };
    });
  }, [normalizedSlices, total]);

  const layout = useMemo(() => {
    const entryWidths = coloredSlices.map((slice) => {
      const percentageWidth = showPercentages
        ? 1 + Bun.stringWidth(slice.percentage)
        : 0;
      return 2 + Bun.stringWidth(slice.label) + percentageWidth;
    });
    const longestEntryWidth = Math.max(0, ...entryWidths);
    const legendOnRight =
      showLegend && PREFERRED_DIAMETER + 2 + longestEntryWidth <= boundedWidth;
    const diameter = Math.max(
      1,
      Math.min(
        PREFERRED_DIAMETER,
        legendOnRight ? boundedWidth - 2 - longestEntryWidth : boundedWidth,
      ),
    );

    return {diameter, entryWidths, legendOnRight, longestEntryWidth};
  }, [boundedWidth, coloredSlices, showLegend, showPercentages]);

  const rasterRows = useMemo(
    () => createRasterRows(coloredSlices, layout.diameter),
    [coloredSlices, layout.diameter],
  );

  const pie = (
    <Box
      width={layout.diameter}
      flexDirection="column"
    >
      {rasterRows.map((runs, rowIndex) => (
        <Text key={`pie-row-${rowIndex}`}>
          {runs.map((run, runIndex) => (
            <Text
              key={`pie-run-${rowIndex}-${runIndex}`}
              color={run.foreground}
              backgroundColor={run.background}
            >
              {run.text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  );

  const legendEntry = (
    slice: ColoredSlice,
    entryWidth: number,
  ): ReactElement => {
    const percentageWidth = showPercentages
      ? 1 + Bun.stringWidth(slice.percentage)
      : 0;
    const allocatedWidth = Math.min(entryWidth, boundedWidth);
    const labelWidth = Math.max(1, allocatedWidth - 2 - percentageWidth);

    return (
      <Box
        key={slice.identity}
        width={allocatedWidth}
        overflow="hidden"
      >
        <Text color={slice.resolvedColor}>■</Text>
        <Text> </Text>
        <Box width={labelWidth}>
          <Text
            bold={showPercentages}
            wrap="truncate-end"
          >
            {slice.label}
          </Text>
        </Box>
        {showPercentages ? <Text> {slice.percentage}</Text> : null}
      </Box>
    );
  };

  return (
    <Box
      width={boundedWidth}
      overflow="hidden"
      flexDirection="column"
    >
      {title ? (
        <Box
          width={boundedWidth}
          justifyContent="center"
        >
          <Text bold>{title}</Text>
        </Box>
      ) : null}
      {coloredSlices.length === 0 ? (
        <Box
          width={boundedWidth}
          justifyContent="center"
        >
          <Text color="gray">No data</Text>
        </Box>
      ) : (
        <Box
          width={boundedWidth}
          flexDirection={layout.legendOnRight ? 'row' : 'column'}
          alignItems={layout.legendOnRight ? 'flex-start' : 'center'}
          justifyContent={layout.legendOnRight ? 'center' : undefined}
          overflow="hidden"
        >
          {pie}
          {showLegend ? (
            <Box
              flexDirection={layout.legendOnRight ? 'column' : 'row'}
              flexWrap={layout.legendOnRight ? 'nowrap' : 'wrap'}
              justifyContent={layout.legendOnRight ? undefined : 'center'}
              width={
                layout.legendOnRight ? layout.longestEntryWidth : boundedWidth
              }
              marginLeft={layout.legendOnRight ? 2 : 0}
            >
              {coloredSlices.map((slice, index) =>
                legendEntry(slice, layout.entryWidths[index] ?? boundedWidth),
              )}
            </Box>
          ) : null}
        </Box>
      )}
    </Box>
  );
};
