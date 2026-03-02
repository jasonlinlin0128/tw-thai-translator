/**
 * Google Apps Script - 中泰翻譯資料收集後端
 *
 * 使用方式：
 * 1. 開一個新的 Google Sheets
 * 2. 點選「擴充功能」→「Apps Script」
 * 3. 把這段程式碼全部貼上，取代原有內容
 * 4. 點「部署」→「新增部署作業」
 *    - 類型選「網頁應用程式」
 *    - 執行身分：「我」
 *    - 誰可以存取：「所有人」
 * 5. 按「部署」，複製產生的網址
 * 6. 把網址貼到翻譯 App 的設定裡
 */

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // 第一次使用時自動建立標題列
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        '時間',
        '角色',
        '語言方向',
        '原文',
        '譯文',
        '類型',
        '備註',
        '裝置ID',
      ]);
      // 凍結標題列
      sheet.setFrozenRows(1);
      // 設定標題樣式
      var headerRange = sheet.getRange(1, 1, 1, 8);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#4285f4');
      headerRange.setFontColor('#ffffff');
    }

    var data = JSON.parse(e.postData.contents);

    sheet.appendRow([
      new Date(data.timestamp).toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei',
      }),
      data.role || '',
      data.direction || '',
      data.original || '',
      data.translated || '',
      data.type || 'translate',
      data.note || '',
      data.deviceId || '',
    ]);

    return ContentService.createTextOutput(
      JSON.stringify({ status: 'ok' })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// GET 端點 - 用來測試部署是否成功
function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'ok',
      message: '中泰翻譯資料收集 API 運作中',
    })
  ).setMimeType(ContentService.MimeType.JSON);
}
