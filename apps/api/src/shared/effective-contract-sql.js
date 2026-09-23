"use strict";

/**
 * Join the single contract-history row that bills a device in a month.
 *
 * This is the rule v_monthly_kpi (database/schema.sql) uses to decide whether a
 * reading has a price: month-level bounds, the latest effective_from wins and id
 * breaks ties (ADR-0019). Work queues that explain *why* a reading is unpriced
 * must pick the same row, otherwise they send people to a contract the price
 * never came from (#96).
 */
function effectiveContractJoin({ deviceIdExpression, monthExpression, historyAlias = "contract_history" }) {
  const candidate = `${historyAlias}_candidate`;
  return `LEFT JOIN device_contract_history ${historyAlias} ON ${historyAlias}.id = (
      SELECT ${candidate}.id
      FROM device_contract_history ${candidate}
      WHERE ${candidate}.device_id = ${deviceIdExpression}
        AND ${monthExpression} >= DATE_FORMAT(${candidate}.effective_from, '%Y-%m')
        AND (${candidate}.effective_to IS NULL
             OR ${monthExpression} <= DATE_FORMAT(${candidate}.effective_to, '%Y-%m'))
      ORDER BY ${candidate}.effective_from DESC, ${candidate}.id DESC
      LIMIT 1
    )`;
}

/**
 * The contract a work queue should blame for an unpriced reading.
 *
 * A history row answers exactly, even when it says "no contract". Only a device
 * with no row for that month falls back to its current contract, because
 * adding a billing period for that contract (billing_from on the device form)
 * is what prices the missing month.
 */
function effectiveContractId({ historyAlias = "contract_history", deviceAlias }) {
  return `CASE WHEN ${historyAlias}.id IS NOT NULL THEN ${historyAlias}.contract_id ELSE ${deviceAlias}.contract_id END`;
}

module.exports = { effectiveContractJoin, effectiveContractId };
