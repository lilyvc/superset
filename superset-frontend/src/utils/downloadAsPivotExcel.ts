/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { getNumberFormatterRegistry } from '@superset-ui/core';
import { t } from '@apache-superset/core/translation';
import { logging } from '@apache-superset/core/utils';
import type ExcelJS from 'exceljs';
import { downloadBlob } from './export';

// Every table cell is exported as the literal text rendered in the DOM, so
// locale-formatted values can't be silently reparsed as different
// numbers/dates (e.g. a Spanish D3_FORMAT rendering of "1.234,56"). A cell's
// text is only restored to a real number when it is unambiguous under the
// active D3_FORMAT locale: a plain number that round-trips losslessly
// through Number() (e.g. "42" or "-3.5"). Restoring those can't reintroduce
// the misparsing the literal-text export guards against. Anything else
// (grouped thousands, percent suffixes, trailing zero padding, date-shaped
// text, other D3_FORMAT output, etc.) stays as text, exactly as rendered: a
// rendered string can't be reliably classified as a genuine date rather
// than a coincidentally date-shaped formatted number (e.g. a custom
// D3_FORMAT grouping/thousands locale can render a plain metric like
// 20240101 as "2024-01-01"), so cells are never reinterpreted as dates.
//
// Number()'s round-trip check assumes "." is a decimal point, which isn't
// true under every locale: a Spanish D3_FORMAT (thousands: '.') renders the
// plain integer 1234 as "1.234", which also round-trips through Number() as
// the decimal 1.234. When the active locale uses "." as its thousands
// separator, a cell containing "." can't be trusted as an unambiguous
// decimal, so it's left as text instead.
function restoreUnambiguousNumbers(worksheet: ExcelJS.Worksheet): void {
  const { thousands } = getNumberFormatterRegistry().d3Format;
  worksheet.eachRow(row => {
    row.eachCell(cell => {
      if (typeof cell.value !== 'string') {
        return;
      }
      if (thousands === '.' && cell.value.includes('.')) {
        return;
      }
      const value = Number(cell.value);
      if (
        cell.value !== '' &&
        Number.isFinite(value) &&
        String(value) === cell.value
      ) {
        cell.value = value;
      }
    });
  });
}

function cellText(cell: HTMLTableCellElement): string {
  // innerText reflects what is actually rendered (excluding hidden nodes);
  // jsdom doesn't implement it, so fall back to textContent.
  return cell.innerText ?? cell.textContent ?? '';
}

// Reads an HTML table into a worksheet, honoring rowspan/colspan so pivot
// tables keep their merged header cells. Every cell is written as text;
// restoreUnambiguousNumbers then retypes only provably-plain numbers.
export function buildPivotWorksheet(
  table: HTMLTableElement,
  workbook: ExcelJS.Workbook,
): ExcelJS.Worksheet {
  const worksheet = workbook.addWorksheet('Sheet1');
  const rows = [...table.rows];
  // occupied[r] tracks columns already claimed by a rowspan from a
  // previous row so following cells skip past them.
  const occupied: Set<number>[] = rows.map(() => new Set<number>());

  rows.forEach((htmlRow, r) => {
    let c = 0;
    [...htmlRow.cells].forEach(htmlCell => {
      while (occupied[r].has(c)) {
        c += 1;
      }
      const rowSpan = Math.max(1, htmlCell.rowSpan);
      const colSpan = Math.max(1, htmlCell.colSpan);
      const target = worksheet.getCell(r + 1, c + 1);
      target.value = cellText(htmlCell);
      for (let dr = 0; dr < rowSpan; dr += 1) {
        for (let dc = 0; dc < colSpan; dc += 1) {
          if (dr > 0 || dc > 0) {
            occupied[r + dr]?.add(c + dc);
          }
        }
      }
      if (rowSpan > 1 || colSpan > 1) {
        worksheet.mergeCells(r + 1, c + 1, r + rowSpan, c + colSpan);
      }
      c += colSpan;
    });
  });
  return worksheet;
}

export default async function exportPivotExcel(
  tableSelector: string,
  fileName: string,
  // Bound via `useToasts()`/`bindActionCreators`, not the raw action
  // creator from `actions.ts`: this module has no dispatch of its own, so an
  // unbound creator would only build a Redux action object and never render
  // a toast.
  addWarningToast?: (text: string) => void,
): Promise<void> {
  const table = document.querySelector(tableSelector);
  if (!(table instanceof HTMLTableElement)) {
    logging.error(
      `[exportPivotExcel] No element found for selector: "${tableSelector}"`,
    );
    addWarningToast?.(
      t('Pivot table download failed, please refresh and try again.'),
    );
    return;
  }
  // exceljs is imported lazily so the ~1MB library stays out of the main
  // bundle until someone actually exports a pivot table.
  const { default: ExcelJS } = await import('exceljs');
  const worksheet = buildPivotWorksheet(table, new ExcelJS.Workbook());
  restoreUnambiguousNumbers(worksheet);
  const buffer = await worksheet.workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${fileName}.xlsx`,
  );
}
