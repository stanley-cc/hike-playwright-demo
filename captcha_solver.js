const fetch = global.fetch;

async function solveWith2Captcha(base64Image, apiKey) {
  if (!apiKey) {
    throw new Error('2Captcha API key is missing');
  }

  const payload = new URLSearchParams({
    key: apiKey,
    method: 'base64',
    body: base64Image,
    json: '1'
  });

  const inRes = await fetch('https://2captcha.com/in.php', {
    method: 'POST',
    body: payload
  });
  const inJson = await inRes.json();
  if (inJson.status !== 1) {
    throw new Error(`2Captcha in.php error: ${inJson.request}`);
  }
  const requestId = inJson.request;

  // Poll for result
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000)); // wait 5s between requests
    const res = await fetch(`https://2captcha.com/res.php?key=${apiKey}&action=get&id=${requestId}&json=1`);
    const resJson = await res.json();
    if (resJson.status === 1) {
      return resJson.request;
    }
    if (resJson.request !== 'CAPCHA_NOT_READY') {
      throw new Error(`2Captcha res.php error: ${resJson.request}`);
    }
  }
  throw new Error('2Captcha timeout: captcha not solved in expected time');
}

module.exports = { solveWith2Captcha };
