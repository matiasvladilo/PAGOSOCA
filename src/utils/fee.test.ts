import { describe, it, expect } from 'vitest';
import { calculateKhipuGrossAmount, calculateCustomerFee } from './fee';

describe('calculateKhipuGrossAmount', () => {
  it('returns 1513 for 1500', () => {
    expect(calculateKhipuGrossAmount(1500)).toBe(1513);
  });
  it('returns 3025 for 3000', () => {
    expect(calculateKhipuGrossAmount(3000)).toBe(3025);
  });
  it('returns 5042 for 5000', () => {
    expect(calculateKhipuGrossAmount(5000)).toBe(5042);
  });
  it('returns 10083 for 10000', () => {
    expect(calculateKhipuGrossAmount(10000)).toBe(10083);
  });
});

describe('calculateCustomerFee', () => {
  it('returns 42 for 5000', () => {
    expect(calculateCustomerFee(5000)).toBe(42);
  });
  it('returns 83 for 10000', () => {
    expect(calculateCustomerFee(10000)).toBe(83);
  });
  it('returns 13 for 1500', () => {
    expect(calculateCustomerFee(1500)).toBe(13);
  });
  it('returns 25 for 3000', () => {
    expect(calculateCustomerFee(3000)).toBe(25);
  });
});
