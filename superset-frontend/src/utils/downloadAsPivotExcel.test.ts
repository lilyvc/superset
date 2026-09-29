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
import ExcelJS from 'exceljs';
import { getNumberFormatterRegistry } from '@superset-ui/core';
import { logging } from '@apache-superset/core/utils';
import { downloadBlob } from './export';
import exportPivotExcel, { buildPivotWorksheet } from './downloadAsPivotExcel';

jest.mock('./export', () => ({
  downloadBlob: jest.fn(),
}));

jest.mock('@apache-superset/core/utils', () => ({
  logging: { error: jest.fn() },
}));

jest.mock('@apache-superset/core/translation', () => ({
  t: (str: string) => str,
}));

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

// Renders a table with the given rows, runs the export, and returns the
// resulting worksheet so each test only has to state its input cells and
// assertions.
async function exportTableAndGetSheet(rowsHtml: string) {
  document.body.innerHTML = `
    <table id="pivot-table">
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
  await exportPivotExcel('#pivot-table', 'export');

  const blob = (downloadBlob as jest.Mock).mock.calls.at(-1)?.[0] as Blob;
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.worksheets[0];
}

test('preserves locale-formatted numbers exactly as rendered, without reinterpreting them', async () => {
  const sheet = await exportTableAndGetSheet(
    '<tr><td>1.234,56</td><td>12,50%</td><td>3.500</td></tr>',
  );

  expect(downloadBlob).toHaveBeenCalledTimes(1);
  expect((downloadBlob as jest.Mock).mock.calls[0][1]).toBe('export.xlsx');

  // These are Spanish-locale D3_FORMAT strings ("." as thousands separator,
  // "," as decimal separator). Each must survive the export untouched, as a
  // text cell, rather than being silently reparsed as a different number
  // (naive HTML table parsing would otherwise turn "1.234,56" into the
  // number 1.23456, "3.500" into 3.5, and "12,50%" into 12.5).
  expect(sheet.getCell('A1').value).toBe('1.234,56');
  expect(sheet.getCell('B1').value).toBe('12,50%');
  expect(sheet.getCell('C1').value).toBe('3.500');
});

test('restores unambiguous plain numbers to native Excel numeric cells', async () => {
  const sheet = await exportTableAndGetSheet(
    '<tr><td>42</td><td>-3.5</td><td>3.500</td><td>1,234</td></tr>',
  );

  // "42" and "-3.5" round-trip exactly through Number(), so they're
  // unambiguous under any locale and are restored to real numbers.
  expect(sheet.getCell('A1').value).toBe(42);
  expect(sheet.getCell('B1').value).toBe(-3.5);
  // "3.500" (trailing zero padding) and "1,234" (grouped thousands) don't
  // round-trip, so they stay as text rather than risk misparsing them.
  expect(sheet.getCell('C1').value).toBe('3.500');
  expect(sheet.getCell('D1').value).toBe('1,234');
});

test('does not restore grouped-thousands numbers under a "." thousands-separator locale', async () => {
  const registry = getNumberFormatterRegistry();
  const original = registry.d3Format;
  registry.setD3Format({ decimal: ',', thousands: '.', grouping: [3] });

  try {
    // Under a Spanish-style D3_FORMAT, "1.234" is the plain integer 1234
    // rendered with a "." group separator, not the decimal 1.234. It also
    // round-trips cleanly through Number(), so without the locale check it
    // would be misrestored to the number 1.234, silently corrupting the
    // value this PR exists to preserve. "42" has no "." and still round
    // trips safely, so it's still restored.
    const sheet = await exportTableAndGetSheet(
      '<tr><td>1.234</td><td>42</td></tr>',
    );
    expect(sheet.getCell('A1').value).toBe('1.234');
    expect(sheet.getCell('B1').value).toBe(42);
  } finally {
    registry.setD3Format(original);
  }
});

test('leaves date-shaped strings as text rather than reinterpreting them as dates', async () => {
  const sheet = await exportTableAndGetSheet(
    '<tr><td>2024-01-01</td><td>2024-01-01 13:45:30</td><td>not-a-date</td></tr>',
  );

  // A rendered string can't be reliably classified as a genuine date rather
  // than a coincidentally date-shaped formatted number (e.g. a custom
  // D3_FORMAT grouping/thousands locale can render a plain metric like
  // 20240101 as "2024-01-01"), so date-shaped cells are left exactly as
  // rendered instead of being reinterpreted as native Excel dates.
  expect(sheet.getCell('A1').value).toBe('2024-01-01');
  expect(sheet.getCell('B1').value).toBe('2024-01-01 13:45:30');
  expect(sheet.getCell('C1').value).toBe('not-a-date');
});

test('merges cells for rowspan and colspan like a rendered pivot table', () => {
  document.body.innerHTML = `
    <table id="pivot-table">
      <tbody>
        <tr><th rowspan="2">A</th><th colspan="2">B</th></tr>
        <tr><td>1</td><td>2</td></tr>
      </tbody>
    </table>
  `;
  const table = document.querySelector('#pivot-table') as HTMLTableElement;
  const sheet = buildPivotWorksheet(table, new ExcelJS.Workbook());

  // "A" spans rows 1-2 in column A; "B" spans columns B-C in row 1; the
  // second row's cells land under B and C, not under A.
  expect(sheet.getCell('A1').value).toBe('A');
  expect(sheet.getCell('B1').value).toBe('B');
  expect(sheet.getCell('B2').value).toBe('1');
  expect(sheet.getCell('C2').value).toBe('2');
  expect(sheet.model.merges).toEqual(
    expect.arrayContaining(['A1:A2', 'B1:C1']),
  );
});

test('logs an error, warns the user via the bound toast callback, and returns early when table element is not found', async () => {
  jest.spyOn(document, 'querySelector').mockReturnValue(null);
  const addWarningToast = jest.fn();

  await exportPivotExcel(
    '.non-existent-selector',
    'test-file',
    addWarningToast,
  );

  expect(logging.error as jest.Mock).toHaveBeenCalledWith(
    '[exportPivotExcel] No element found for selector: ".non-existent-selector"',
  );
  // Passed in already bound to dispatch (e.g. via `useToasts()`), so calling
  // it directly is what actually renders the toast -- unlike the raw action
  // creator, which only builds a Redux action object.
  expect(addWarningToast).toHaveBeenCalledWith(
    'Pivot table download failed, please refresh and try again.',
  );
  expect(downloadBlob).not.toHaveBeenCalled();
});

test('does not throw when the table element is not found and no toast callback is provided', async () => {
  jest.spyOn(document, 'querySelector').mockReturnValue(null);

  await expect(
    exportPivotExcel('.non-existent-selector', 'test-file'),
  ).resolves.toBeUndefined();
});
