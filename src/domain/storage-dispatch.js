"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NE_STORAGE_DISPATCH = api;
  if (root.window && root.window !== root) root.window.NE_STORAGE_DISPATCH = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const ALGORITHM_VERSION = "daily-price-pairing-v1";
  const SPOT_REVENUE_MODE = "spot_increment_only";
  const DEFAULT_EFFICIENCY = 0.9;
  const HOURS_PER_DAY = 24;

  function resolveStorageEfficiency(project, scenarioConfig) {
    return project?.storageRoundTripEfficiency ?? scenarioConfig?.storageRoundTripEfficiency ?? DEFAULT_EFFICIENCY;
  }

  function isStorageEfficiency(value) {
    return Number.isFinite(value) && value > 0 && value <= 1;
  }

  function finiteNumber(value, name, minimum, strict = false) {
    if (typeof value !== "number" || !Number.isFinite(value)
        || (strict ? value <= minimum : value < minimum)) {
      throw new RangeError(`${name} must be a finite number ${strict ? ">" : ">="} ${minimum}.`);
    }
  }

  function validateInputs(prices, generationMwh, powerMw, durationH, efficiency) {
    if (!Array.isArray(prices) || !Array.isArray(generationMwh)
        || !prices.length || prices.length % HOURS_PER_DAY !== 0 || prices.length !== generationMwh.length) {
      throw new RangeError("prices and generationMwh must cover the same complete 24-hour model days.");
    }
    for (let hour = 0; hour < prices.length; hour += 1) {
      finiteNumber(prices[hour], `prices[${hour}]`, -Infinity);
      finiteNumber(generationMwh[hour], `generationMwh[${hour}]`, 0);
    }
    finiteNumber(powerMw, "powerMw", 0);
    finiteNumber(durationH, "durationH", 0, true);
    finiteNumber(efficiency, "roundTripEfficiency", 0, true);
    if (efficiency > 1) throw new RangeError("roundTripEfficiency must not exceed 1.");
    if (!Number.isFinite(powerMw * durationH)) throw new RangeError("Storage capacity exceeds the finite numeric range.");
  }

  function accumulator() {
    let total = 0, correction = 0;
    return {
      add(value) {
        const adjusted = value - correction;
        const next = total + adjusted;
        correction = (next - total) - adjusted;
        total = next;
      },
      value() { return total; }
    };
  }

  // Deterministic, explainable daily pairing; this is not a global optimizer.
  // SOC is measured in charging-side AC-equivalent MWh. All round-trip loss is
  // applied at discharge: delivered AC MWh = SOC withdrawal * efficiency.
  function calculateHourlyDispatch({ prices, generationMwh, powerMw, durationH, roundTripEfficiency, includeHourly = false } = {}) {
    validateInputs(prices, generationMwh, powerMw, durationH, roundTripEfficiency);
    const capacityMwh = powerMw * durationH;
    const efficiency = roundTripEfficiency;
    const totals = Object.fromEntries(["chargeMwh", "dischargeMwh", "chargeOpportunityCost", "dischargeRevenue"]
      .map((key) => [key, accumulator()]));
    const hourly = includeHourly ? [] : null;

    for (let start = 0; start < prices.length; start += HOURS_PER_DAY) {
      const charge = Array(HOURS_PER_DAY).fill(0);
      const discharge = Array(HOURS_PER_DAY).fill(0);
      const soc = Array(HOURS_PER_DAY).fill(0);
      const pairs = [];
      for (let buy = 0; buy < HOURS_PER_DAY - 1; buy += 1) {
        if (!(generationMwh[start + buy] > 0) || powerMw === 0) continue;
        for (let sell = buy + 1; sell < HOURS_PER_DAY; sell += 1) {
          const buyPrice = prices[start + buy], sellPrice = prices[start + sell];
          const gain = sellPrice * efficiency - buyPrice;
          const priceTolerance = Math.max(1, Math.abs(buyPrice), Math.abs(sellPrice)) * Number.EPSILON * 32;
          // A genuine upward price move is required as well as positive net
          // value, so flat negative prices cannot reward deliberate energy loss.
          if (sellPrice > buyPrice && gain > priceTolerance) pairs.push({ buy, sell, gain });
        }
      }
      pairs.sort((a, b) => b.gain - a.gain || a.buy - b.buy || a.sell - b.sell);

      for (const { buy, sell } of pairs) {
        if (discharge[buy] > 0 || charge[sell] > 0) continue;
        let amount = Math.min(
          Math.min(powerMw, generationMwh[start + buy]) - charge[buy],
          (powerMw - discharge[sell]) / efficiency
        );
        // Every interval occupied by this pair must have remaining capacity.
        for (let hour = buy; hour < sell; hour += 1) amount = Math.min(amount, capacityMwh - soc[hour]);
        const tolerance = Math.max(1, powerMw) * Number.EPSILON * 32;
        const delivered = amount * efficiency;
        if (!(amount > tolerance) || !(delivered > 0)) continue;
        charge[buy] += amount;
        discharge[sell] += delivered;
        for (let hour = buy; hour < sell; hour += 1) soc[hour] += amount;
      }

      for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
        const price = prices[start + hour];
        const cost = charge[hour] * price;
        const revenue = discharge[hour] * price;
        totals.chargeMwh.add(charge[hour]);
        totals.dischargeMwh.add(discharge[hour]);
        totals.chargeOpportunityCost.add(cost);
        totals.dischargeRevenue.add(revenue);
        if (hourly) hourly.push({ chargeMwh: charge[hour], dischargeMwh: discharge[hour],
          socMwh: soc[hour], incrementalRevenue: revenue - cost });
      }
    }

    const result = Object.fromEntries(Object.entries(totals).map(([key, sum]) => [key, sum.value()]));
    result.incrementalRevenue = result.dischargeRevenue - result.chargeOpportunityCost;
    if (Object.values(result).some((value) => !Number.isFinite(value))) {
      throw new RangeError("Storage dispatch totals exceed the finite numeric range.");
    }
    if (hourly) result.hourly = hourly;
    return result;
  }

  return Object.freeze({ ALGORITHM_VERSION, SPOT_REVENUE_MODE, calculateHourlyDispatch, isStorageEfficiency, resolveStorageEfficiency });
});
