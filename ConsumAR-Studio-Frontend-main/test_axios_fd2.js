const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

async function run() {
  const fileBuffer = Buffer.from('dummy content');
  const pythonForm = new FormData();
  pythonForm.append('file', fileBuffer, { filename: 'model.glb' });
  pythonForm.append('width', '1.1');
  pythonForm.append('tier', 'SAMPLE');
  pythonForm.append('unit', 'm');
  
  const headers = pythonForm.getHeaders();
  headers['Content-Length'] = pythonForm.getLengthSync();
  
  try {
    const rawRes = await axios.post('http://13.232.237.176:5000/resize', pythonForm, {
      headers
    });
    console.log(rawRes.status);
    console.log(rawRes.data);
  } catch (err) {
    console.error(err.response ? err.response.data : err.message);
  }
}
run();
