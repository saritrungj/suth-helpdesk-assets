"use strict";

/**
 * Join the single location-history row effective for a device/month.
 *
 * Old databases may contain overlapping ranges. The latest effective_from wins;
 * id is the deterministic tie-breaker. Keeping this rule here prevents a history
 * join from multiplying usage rows and therefore financial totals.
 */
function effectiveLocationJoin({ deviceAlias, monthExpression, historyAlias = "location_history" }) {
  const newerAlias = `${historyAlias}_newer`;
  return `LEFT JOIN device_location_history ${historyAlias}
    ON ${historyAlias}.device_id = ${deviceAlias}.id
    AND ${monthExpression} IS NOT NULL
    AND ${monthExpression} >= DATE_FORMAT(${historyAlias}.effective_from, '%Y-%m')
    AND (${historyAlias}.effective_to IS NULL OR ${monthExpression} < DATE_FORMAT(${historyAlias}.effective_to, '%Y-%m'))
    AND NOT EXISTS (
      SELECT 1
      FROM device_location_history ${newerAlias}
      WHERE ${newerAlias}.device_id = ${historyAlias}.device_id
        AND ${monthExpression} >= DATE_FORMAT(${newerAlias}.effective_from, '%Y-%m')
        AND (${newerAlias}.effective_to IS NULL OR ${monthExpression} < DATE_FORMAT(${newerAlias}.effective_to, '%Y-%m'))
        AND (
          ${newerAlias}.effective_from > ${historyAlias}.effective_from
          OR (${newerAlias}.effective_from = ${historyAlias}.effective_from AND ${newerAlias}.id > ${historyAlias}.id)
        )
    )`;
}

module.exports = { effectiveLocationJoin };
