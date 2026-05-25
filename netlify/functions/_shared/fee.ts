const KHIPU_RATE = 0.0069;
const IVA = 0.19;
const TOTAL_FEE_RATE = KHIPU_RATE * (1 + IVA);

export function calculateKhipuGrossAmount(netAmount: number): number {
  return Math.ceil(netAmount / (1 - TOTAL_FEE_RATE));
}

export function calculateCustomerFee(netAmount: number): number {
  return calculateKhipuGrossAmount(netAmount) - netAmount;
}
