const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');
const { kill } = require('process');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = 'token.json';
const sheetId = process.argv[2];

fs.readFile('credentials.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  authorize(JSON.parse(content), listMajors);
});

function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error while trying to retrieve access token', err);
      oAuth2Client.setCredentials(token);
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

async function listMajors(auth) {
  const sheets = google.sheets({version: 'v4', auth});
  sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'A3:S'
  },async (err, res) => {
    console.time('Result');
    if (err) return console.log('The API returned an error: ' + err);
    let rows = res.data.values;
    const rowsLength = rows.length;
    if (rowsLength) {
        const collectedTodaysData = [];
        for (let i = 0; i < rowsLength; i++) {
            const _withUrlspreadsheetId = rows[i][18];
            if (_withUrlspreadsheetId) {
                let rowCountFunc;
                if (rows[i][0] && rows[i][1]) {
                  rowCountFunc = (a) => a >= parseInt(rows[i][0]) && a <= parseInt(rows[i][1]);
                } else {
                  rowCountFunc = (...args) => true;
                }
                const spreadsheetId = _withUrlspreadsheetId.split('/')[5];
                console.log(`Preparing ${spreadsheetId}`);
                await sleep(1000);
                const colorsCount = {
                    '0.6': 0, // Orange
                    '1': 0, // Yellow
                    '0.1107266458131488': 0 // Blue
                };
                const colorSheet = await sheets.spreadsheets.get({
                    spreadsheetId,
                    ranges: 'E:E',
                    includeGridData: true
                });
                const rowData = colorSheet.data.sheets[0].data[0].rowData;
                const rowDataLength = rowData ? rowData.length : 0;
                for (let j = 2; j < rowDataLength; j++) {
                    if (!rowCountFunc(j + 1)) continue;
                    if (rowData[j].values
                        && rowData[j].values[0]
                        && rowData[j].values[0].effectiveFormat
                        && rowData[j].values[0].effectiveFormat.backgroundColor  ) {
                      const cellBackcolor = rowData[j].values[0].effectiveFormat.backgroundColor;
                      const colorValue = cellBackcolor.red * cellBackcolor.green;
                      if (colorValue === 1 && cellBackcolor.blue) continue;
                      colorsCount[colorValue]++;
                    }
                }
                collectedTodaysData[i] = {
                    colors: {
                        orange: String(colorsCount['0.6']),
                        yellow: String(colorsCount['1']),
                        blue: String(colorsCount['0.1107266458131488'])
                    },
                    index: i
                };
                console.log(collectedTodaysData[i]);
            }
        }
        for (let i = 0; i < rowsLength; i++) {
            /* Swapping day before yesterdays data to yesterdays data  */
            if (rows[i][8] && rows[i][9] && rows[i][10]) {
                rows[i][11] = rows[i][8];
                rows[i][12] = rows[i][9];
                rows[i][13] = rows[i][10];
            }
            /* Swapping yestardays data to todays data  */
            if (rows[i][5] && rows[i][6] && rows[i][7]) {
                rows[i][8] = rows[i][5];
                rows[i][9] = rows[i][6];
                rows[i][10] = rows[i][7];
            }
            if (rows[i][18]) {
                /* Updating todays data */
                rows[i][5] = collectedTodaysData[i].colors.orange;
                rows[i][6] = collectedTodaysData[i].colors.yellow;
                rows[i][7] = collectedTodaysData[i].colors.blue;
            }
            rows[i].splice(0, 5);
            rows[i].splice(9, 16);
        }

        const batchData = [{
            range: 'F3:N',
            majorDimension: 'ROWS',
            values: rows
        }];

        const response = await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: sheetId,
            resource: {
                valueInputOption: 'RAW',
                data: batchData
            }
        });
        console.timeEnd('Result');
    } else {
      console.log('No data found.');
    }
  });
}

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
