// Helper function to format price
export const formatPrice = (price: number, currency: string) => {
  // Convert from cents to actual currency amount
  const amount = price / 100;
  const upperCurrency = currency.toUpperCase();

  // Handle Malaysian Ringgit specifically to show "RM" instead of "MYR"
  if (upperCurrency === "MYR") {
    return `RM ${amount.toFixed(2)}`;
  }

  // For other currencies, use standard formatting
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: upperCurrency,
  }).format(amount);
};


