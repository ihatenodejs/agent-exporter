/**
 * Number formatting and color utilities for UI components
 */

import chalk from 'chalk';

export const integerFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

export const decimalFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatCount = (value: number): string =>
  value === 0 ? chalk.gray('0') : chalk.white(integerFormatter.format(value));

export const formatTokens = (value: number): string =>
  value === 0 ? chalk.gray('0') : chalk.yellow(integerFormatter.format(value));

export const formatTokensDecimal = (value: number): string =>
  value === 0
    ? chalk.gray('0.0')
    : chalk.yellow(decimalFormatter.format(value));

export const formatCurrency = (value: number): string =>
  value === 0
    ? chalk.gray(currencyFormatter.format(0))
    : chalk.green(currencyFormatter.format(value));
