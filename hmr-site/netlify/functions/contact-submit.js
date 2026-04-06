const crypto = require('crypto');

const REQUIRED_FIELDS = ['name', 'email', 'message'];
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

const base64url = (input) => Buffer.from(input).toString('base64url');

const createSignedJwt = ({ serviceAccountEmail, privateKey }) => {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccountEmail,
    scope: GOOGLE_SHEETS_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url');
  return `${unsigned}.${signature}`;
};

const fetchAccessToken = async ({ serviceAccountEmail, privateKey }) => {
  const assertion = createSignedJwt({ serviceAccountEmail, privateKey });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('Auth response error:', errorData);
    throw new Error(`OAuth token request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const payload = JSON.parse(event.body || '{}');
    console.log('Received payload:', payload.email); // Log for debugging

    const missing = REQUIRED_FIELDS.filter((field) => !String(payload[field] || '').trim());
    if (missing.length) {
      return json(400, { error: `Missing required fields: ${missing.join(', ')}` });
    }

    // UPDATED: Variables now match your Netlify Environment Variable keys
    const serviceAccountEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const rawKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    const range = process.env.GOOGLE_SHEETS_RANGE || 'Sheet1!A:F';

    if (!serviceAccountEmail || !rawKey || !spreadsheetId) {
      console.error('Config Error: Missing one or more GOOGLE_SHEETS env vars');
      return json(500, { error: 'Server configuration error.' });
    }

    // Fix newlines in the private key
    const privateKey = rawKey.replace(/\\n/g, '\n');

    const token = await fetchAccessToken({ serviceAccountEmail, privateKey });
    
    const row = [
      new Date().toISOString(),
      payload.name,
      payload.organisation || '',
      payload.email,
      payload.message,
      event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || ''
    ];

    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;

    const appendResponse = await fetch(sheetsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [row] })
    });

    if (!appendResponse.ok) {
      const sheetError = await appendResponse.text();
      console.error('Google Sheets Error:', sheetError);
      throw new Error(`Sheets append failed: ${appendResponse.status}`);
    }

    console.log('Successfully appended to sheet');
    return json(200, { ok: true });
  } catch (error) {
    console.error('Detailed Function Error:', error.message);
    return json(500, { error: 'Unable to submit enquiry right now.' });
  }
};
