"use strict";

/**
 * ExportAnalyzer — learns the household's export behaviour and turns it
 * into load-shifting advice.
 *
 * Some days the array exports (sunny, low load), some days it doesn't
 * (clouds, high load). The analyzer learns:
 *   - how often this window exports and at what power (profile.export)
 *   - today's export total so far (vs the learned export-day average)
 *   - when exporting now, whether it is the normal window or unusual
 *
 * Advice is professional and conditional: on a typical export window it
 * suggests shifting loads into free solar; on an unusual export it stays
 * quiet unless there is a real gap (solar high + grid importing).
 */

const EXPORT_DAY_MIN_KWH = 0.3;      // a "export day" produced at least this
const UNUSUAL_EXPORT_MARGIN = 0.25;  // freq below typical*this = unusual
const IMPORT_GAP_MIN_W = 300;        // solar - home gap before speaking
const SOLAR_MIN_FOR_ADVICE = 500;    // need real solar to talk about export

/**
 * @param {object} params
 * @param {object} params.exportProfile  - profile.export {weekday, weekend}
 * @param {string} params.dayType        - "weekday" | "weekend"
 * @param {string} params.bucketId       - current time bucket
 * @param {object} params.gridFlow       - {mode, direction, homeW, solarW}
 * @param {number} params.todayExportKwh - export kWh since midnight
 * @param {object} params.weather        - {isDay, cloudCover}
 * @returns {object} export analysis
 */
function analyzeExport({
  exportProfile,
  dayType,
  bucketId,
  gridFlow = {},
  todayExportKwh = 0,
  weather = {},
}) {
  const profile = exportProfile?.[dayType] || exportProfile?.weekday;
  const exportingNow = gridFlow.direction === "export";
  const solarW = Number(gridFlow.solarW) || 0;
  const homeW = Number(gridFlow.homeW) || 0;
  const gapW = Math.max(0, solarW - homeW);
  const bucket = profile?.peakWindow?.bucketId === bucketId ? profile.peakWindow : null;

  // Typical export for this window: use the peak window stats if we are in it,
  // otherwise the day's overall export frequency.
  const typicalFreq = profile?.exportDayFreq ?? 0;

  const result = {
    exportingNow,
    exportW: exportingNow ? Math.max(0, gapW) : 0,
    solarW,
    homeW,
    gapW,
    todayExportKwh: Math.round(todayExportKwh * 10) / 10,
    typicalExportDayKwh: profile?.avgExportKwhPerDay ?? 0,
    exportDayFreq: typicalFreq,
    typicalExportWindow: profile?.peakWindow || null,
    inTypicalWindow: !!bucket,
    type: null,
    severity: "none",
    message: null,
  };

  const isDaytime = weather?.isDay !== false && solarW > SOLAR_MIN_FOR_ADVICE;

  // 1. Exporting now in the usual window → shift-load advice.
  if (exportingNow && isDaytime && bucket && gapW >= 200) {
    result.type = "export_opportunity";
    result.severity = "info";
    result.message = `Solar is covering the home and exporting ~${Math.round(result.exportW)}W — your usual export window (${profile.peakWindow.bucketId.replace("_", " ")}). Running heavy loads now uses free solar instead of buying grid.`;
    return result;
  }

  // 2. Exporting now, but this window rarely exports → notable but brief.
  if (exportingNow && isDaytime && typicalFreq < UNUSUAL_EXPORT_MARGIN) {
    result.type = "unusual_export";
    result.severity = "low";
    result.message = `Exporting ~${Math.round(result.exportW)}W at a time the house usually imports. ${gapW >= 200 ? "Loads are light relative to solar — usable free capacity right now." : ""}`;
    return result;
  }

  // 3. Importing while solar is producing and the house draw exceeds solar.
  // gapW = solar - home is zero whenever home > solar, so use the import gap.
  const importW = Math.max(0, homeW - solarW);
  // Quiet house importing a little is not a missed export window.
  if (!exportingNow && isDaytime && gridFlow.direction === "import" && importW >= IMPORT_GAP_MIN_W && solarW >= SOLAR_MIN_FOR_ADVICE && homeW >= 700) {
    result.type = "missed_export_window";
    result.severity = "low";
    result.message = `Solar ${Math.round(solarW)}W, house ${Math.round(homeW)}W. About ${Math.round(importW)}W is coming from WAPDA. Run washers and irons in the solar peak if you can.`;
    return result;
  }

  // 4. Export day tracking — only as context, not a standing tip.
  if (result.todayExportKwh > 0 && profile?.avgExportKwhPerDay > 0.5 && result.todayExportKwh > profile.avgExportKwhPerDay * 1.3) {
    result.type = "export_day_high";
    result.severity = "low";
    result.message = `Today's export (${result.todayExportKwh} kWh) is above your usual export days (${profile.avgExportKwhPerDay} kWh).`;
    return result;
  }

  return result;
}

module.exports = { analyzeExport };
