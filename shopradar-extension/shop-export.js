/**
 * ShopRadar — Excel 导出（SpreadsheetML，WPS / Excel 可设列宽）
 */
var ShopRadarExport = (function () {
  /**
   * 列宽（点），与 WPS 截图比例一致：
   * 商品标题 | SKU | 售价 | 划线价 | 供应商 | 图片链接 | 上架日期
   */
  var EXPORT_COLUMN_WIDTHS_PT = [240, 120, 210, 96, 120, 400, 110];

  /**
   * @param {string} text
   * @returns {string}
   */
  function escapeXml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  /**
   * @param {string[]} cells
   * @param {string} [styleId]
   * @returns {string}
   */
  function buildRowXml(cells, styleId) {
    var styleAttr = styleId ? ' ss:StyleID="' + styleId + '"' : '';
    var cellXml = (cells || []).map(function (value) {
      return (
        '<Cell' +
        styleAttr +
        '><Data ss:Type="String">' +
        escapeXml(value) +
        '</Data></Cell>'
      );
    });
    return '<Row>' + cellXml.join('') + '</Row>';
  }

  /**
   * @param {string[]} headers
   * @param {string[][]} rows
   * @param {number[]} [columnWidthsPt]
   * @returns {string}
   */
  function buildSpreadsheetMl(headers, rows, columnWidthsPt) {
    var widths =
      Array.isArray(columnWidthsPt) && columnWidthsPt.length
        ? columnWidthsPt
        : EXPORT_COLUMN_WIDTHS_PT;
    var columnCount = Math.max(
      headers ? headers.length : 0,
      widths.length
    );
    while (widths.length < columnCount) {
      widths.push(110);
    }

    var columnsXml = widths
      .slice(0, columnCount)
      .map(function (width) {
        return '<Column ss:AutoFitWidth="0" ss:Width="' + width + '"/>';
      })
      .join('');

    var headerRow = buildRowXml(headers || [], 'Header');
    var dataRows = (rows || [])
      .map(function (row) {
        return buildRowXml(row);
      })
      .join('');

    return (
      '<?xml version="1.0" encoding="UTF-8"?>\r\n' +
      '<?mso-application progid="Excel.Sheet"?>\r\n' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\r\n' +
      ' xmlns:o="urn:schemas-microsoft-com:office:office"\r\n' +
      ' xmlns:x="urn:schemas-microsoft-com:office:excel"\r\n' +
      ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"\r\n' +
      ' xmlns:html="http://www.w3.org/TR/REC-html40">\r\n' +
      ' <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">\r\n' +
      '  <Author>ShopRadar</Author>\r\n' +
      ' </DocumentProperties>\r\n' +
      ' <Styles>\r\n' +
      '  <Style ss:ID="Default" ss:Name="Normal">\r\n' +
      '   <Alignment ss:Vertical="Center"/>\r\n' +
      '   <Font ss:FontName="Calibri" x:CharSet="134" ss:Size="11"/>\r\n' +
      '  </Style>\r\n' +
      '  <Style ss:ID="Header">\r\n' +
      '   <Font ss:Bold="1" ss:FontName="Calibri" x:CharSet="134" ss:Size="11"/>\r\n' +
      '   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>\r\n' +
      '  </Style>\r\n' +
      ' </Styles>\r\n' +
      ' <Worksheet ss:Name="Products">\r\n' +
      '  <Table>\r\n' +
      columnsXml +
      headerRow +
      dataRows +
      '  </Table>\r\n' +
      ' </Worksheet>\r\n' +
      '</Workbook>\r\n'
    );
  }

  /**
   * @param {string[]} headers
   * @param {string[][]} rows
   * @param {string} domain
   */
  function downloadExcelFile(headers, rows, domain) {
    var xml = buildSpreadsheetMl(headers, rows, EXPORT_COLUMN_WIDTHS_PT);
    var safeDomain = (domain || 'unknown')
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_+/g, '_');
    var fileName = 'ShopRadar_' + safeDomain + '_Products.xls';
    var blob = new Blob(['\uFEFF' + xml], {
      type: 'application/vnd.ms-excel;charset=utf-8;',
    });
    var objectUrl = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  }

  return {
    EXPORT_COLUMN_WIDTHS_PT: EXPORT_COLUMN_WIDTHS_PT,
    buildSpreadsheetMl: buildSpreadsheetMl,
    downloadExcelFile: downloadExcelFile,
  };
})();
