const fs = require('fs');
const axios = require('axios');

async function test() {
  const fileBuffer = fs.readFileSync('../ConsumAR-Studio-Frontend-main/public/sample.glb');
  
  const fields = {
    unit: 'm',
    tier: 'PAID',
    watermark_text: 'TryitFirstLabs',
    width: '10'
  };

  const boundary = '----NextJsMultipartBoundary' + Math.random().toString(36).substring(2);
  const chunks = [];
  
  for (const [key, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
  }
  
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.glb"\r\nContent-Type: application/octet-stream\r\n\r\n`));
  chunks.push(fileBuffer);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  
  const finalBody = Buffer.concat(chunks);

  try {
    const rawRes = await axios.post('http://localhost:5001/resize', finalBody, {
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': finalBody.length.toString()
      },
      validateStatus: () => true
    });
    console.log(rawRes.status);
    console.log(rawRes.data);
  } catch (e) {
    console.error(e);
  }
}
test();
