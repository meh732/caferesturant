import * as XLSX from 'xlsx';

export interface ReportSection {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

export interface SummaryCard {
  label: string;
  value: string;
  color?: string;
}

/**
 * Export a single table to an Excel file (.xlsx)
 */
export function exportToExcel(
  data: Record<string, any>[],
  filename: string,
  sheetName: string = 'گزارش'
) {
  try {
    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Set RTL direction for Iranian Excel users
    worksheet['!dir'] = 'rtl';

    // Auto-calculate column widths
    if (data.length > 0) {
      const keys = Object.keys(data[0]);
      const colWidths = keys.map((key) => {
        let maxLen = String(key).length;
        data.forEach((row) => {
          const val = row[key];
          if (val !== null && val !== undefined) {
            maxLen = Math.max(maxLen, String(val).length);
          }
        });
        return { wch: Math.min(Math.max(maxLen + 4, 12), 40) };
      });
      worksheet['!cols'] = colWidths;
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  } catch (err) {
    console.error('Excel export error:', err);
    alert('خطا در صدور فایل اکسل.');
  }
}

/**
 * Export multiple tables into a single multi-sheet Excel workbook (.xlsx)
 */
export function exportMultipleSheetsToExcel(
  sheets: { name: string; data: Record<string, any>[] }[],
  filename: string
) {
  try {
    const workbook = XLSX.utils.book_new();

    sheets.forEach((sheet) => {
      if (!sheet.data || sheet.data.length === 0) return;
      const worksheet = XLSX.utils.json_to_sheet(sheet.data);
      worksheet['!dir'] = 'rtl';

      const keys = Object.keys(sheet.data[0]);
      const colWidths = keys.map((key) => {
        let maxLen = String(key).length;
        sheet.data.forEach((row) => {
          const val = row[key];
          if (val !== null && val !== undefined) {
            maxLen = Math.max(maxLen, String(val).length);
          }
        });
        return { wch: Math.min(Math.max(maxLen + 4, 12), 40) };
      });
      worksheet['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.substring(0, 31));
    });

    XLSX.writeFile(workbook, `${filename}.xlsx`);
  } catch (err) {
    console.error('Multi-sheet Excel export error:', err);
    alert('خطا در صدور فایل اکسل چندبرگه.');
  }
}

/**
 * Print/PDF export utility using native printable window
 */
export function printReportPDF(
  title: string,
  subtitle: string,
  summaryCards: SummaryCard[],
  sections: ReportSection[],
  restaurantName: string = 'مجموعه رستوران و کافه آرکا'
) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('لطفاً اجازه باز شدن پنجره (Pop-up) را در مرورگر صادر فرمایید.');
    return;
  }

  const currentDate = new Date().toLocaleDateString('fa-IR');
  const currentTime = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

  const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="fa">
    <head>
      <meta charset="utf-8" />
      <title>${title} - ${restaurantName}</title>
      <style>
        @import url('https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Vazirmatn', -apple-system, sans-serif;
          color: #1a1a1a;
          background: #fff;
          padding: 24px;
          font-size: 12px;
          direction: rtl;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #007AFF;
          padding-bottom: 12px;
          margin-bottom: 20px;
        }
        .header-title h1 { font-size: 20px; font-weight: 800; color: #111; }
        .header-title p { font-size: 12px; color: #666; margin-top: 2px; }
        .header-meta { text-align: left; font-size: 11px; color: #555; line-height: 1.6; }
        
        .summary-grid {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .summary-card {
          flex: 1;
          min-width: 140px;
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          padding: 10px 14px;
        }
        .summary-card .label { font-size: 11px; color: #6c757d; font-weight: 500; }
        .summary-card .value { font-size: 15px; font-weight: 800; color: #111; margin-top: 4px; }

        .section { margin-bottom: 24px; }
        .section-title {
          font-size: 14px;
          font-weight: 700;
          color: #007AFF;
          margin-bottom: 10px;
          padding-bottom: 4px;
          border-bottom: 1px solid #e9ecef;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 16px;
        }
        th, td {
          padding: 8px 10px;
          text-align: right;
          border: 1px solid #dee2e6;
          font-size: 11px;
        }
        th {
          background-color: #f1f3f5;
          color: #343a40;
          font-weight: 700;
        }
        tr:nth-child(even) { background-color: #f8f9fa; }

        .signatures {
          display: flex;
          justify-content: space-between;
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px dashed #ccc;
        }
        .sig-box {
          text-align: center;
          width: 28%;
          font-size: 11px;
          color: #555;
        }
        .sig-line {
          margin-top: 45px;
          border-top: 1px solid #888;
        }

        @media print {
          body { padding: 0; }
          .no-print { display: none; }
          @page { size: A4 portrait; margin: 12mm; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-title">
          <h1>${restaurantName}</h1>
          <p>${title} - ${subtitle}</p>
        </div>
        <div class="header-meta">
          <div>تاریخ صدور: <strong>${currentDate}</strong></div>
          <div>زمان صدور: <strong>${currentTime}</strong></div>
          <div>نوع گزارش: مدیریتی رسمی</div>
        </div>
      </div>

      ${
        summaryCards.length > 0
          ? `<div class="summary-grid">
              ${summaryCards
                .map(
                  (c) => `
                <div class="summary-card">
                  <div class="label">${c.label}</div>
                  <div class="value">${c.value}</div>
                </div>
              `
                )
                .join('')}
            </div>`
          : ''
      }

      ${sections
        .map(
          (sec) => `
        <div class="section">
          ${sec.title ? `<div class="section-title">${sec.title}</div>` : ''}
          <table>
            <thead>
              <tr>
                ${sec.headers.map((h) => `<th>${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${sec.rows
                .map(
                  (row) => `
                <tr>
                  ${row.map((cell) => `<td>${cell}</td>`).join('')}
                </tr>
              `
                )
                .join('')}
              ${sec.rows.length === 0 ? `<tr><td colSpan="${sec.headers.length}" style="text-align: center; color: #888;">اطلاعاتی ثبت نشده است.</td></tr>` : ''}
            </tbody>
          </table>
        </div>
      `
        )
        .join('')}

      <div class="signatures">
        <div class="sig-box">
          <div>مهر و امضای مسئول انبار / صندوق</div>
          <div class="sig-line"></div>
        </div>
        <div class="sig-box">
          <div>مهر و امضای حسابدار ارشد</div>
          <div class="sig-line"></div>
        </div>
        <div class="sig-box">
          <div>تاییدیه مدیریت مجموعه</div>
          <div class="sig-line"></div>
        </div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 300);
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
