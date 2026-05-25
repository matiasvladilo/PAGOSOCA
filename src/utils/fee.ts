export const KHIPU_RATE = 0.0069;
export const IVA = 0.19;
export const TOTAL_FEE_RATE = KHIPU_RATE * (1 + IVA); // 0.008211

export function calculateKhipuGrossAmount(netAmount: number): number {
  return Math.ceil(netAmount / (1 - TOTAL_FEE_RATE));
}

export function calculateCustomerFee(netAmount: number): number {
  return calculateKhipuGrossAmount(netAmount) - netAmount;
}
