import { Share } from "react-native";

import type { HistoryPoint } from "@/context/EnergyContext";

type ExportPeriod = "day" | "week" | "month" | "year";

function buildCsv(history: HistoryPoint[], period: ExportPeriod) {
  const header = "time,meter1_kw,meter2_kw,voltage_v";
  const rows = history.map((point) =>
    [
      point.time,
      point.meter1.toFixed(2),
      point.meter2.toFixed(2),
      point.voltage.toFixed(0),
    ].join(","),
  );
  return [`# GridWise ${period} export`, header, ...rows].join("\n");
}

async function shareTextFile(fileName: string, content: string) {
  await Share.share({
    title: fileName,
    message: content,
  });
}

export async function exportCsv(history: HistoryPoint[], period: ExportPeriod) {
  await shareTextFile(`gridwise-${period}.csv`, buildCsv(history, period));
}

export async function exportExcel(
  history: HistoryPoint[],
  period: ExportPeriod,
) {
  const xml = `<?xml version="1.0"?><worksheet><name>GridWise ${period}</name><rows>${history
    .map(
      (point) =>
        `<row><c>${point.time}</c><c>${point.meter1.toFixed(2)}</c><c>${point.meter2.toFixed(2)}</c><c>${point.voltage.toFixed(0)}</c></row>`,
    )
    .join("")}</rows></worksheet>`;
  await shareTextFile(`gridwise-${period}.xls`, xml);
}

export async function exportPdf(history: HistoryPoint[], period: ExportPeriod) {
  const rows = history
    .map((point) =>
      [
        point.time,
        point.meter1.toFixed(2),
        point.meter2.toFixed(2),
        point.voltage.toFixed(0),
      ].join(" | "),
    )
    .join("\n");

  const content = [
    `GridWise ${period} report`,
    "time | meter1_kw | meter2_kw | voltage",
    rows,
  ].join("\n");
  await shareTextFile(`gridwise-${period}.pdf`, content);
}
