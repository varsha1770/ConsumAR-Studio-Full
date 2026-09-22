const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

(async () => {
  try {
    const form = new FormData();
    // Create a valid tiny 1x1 PNG image buffer
    const imgBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    
    form.append('images', imgBuffer, { filename: 'test.png', contentType: 'image/png' });
    
    console.log('Sending request to LOCALHOST api which forwards to EC2...');
    const res = await axios.post('http://localhost:3000/api/generate-3d', form, {
      headers: {
        'x-guest-mac': 'test_' + Math.random(),
        'x-forwarded-for': '1.2.3.' + Math.floor(Math.random() * 255),
        ...form.getHeaders()
      }
    });
    console.log('Success:', res.status, res.data);
  } catch (err) {
    if (err.response) {
      console.error('API Error Response:', err.response.status, err.response.data);
    } else {
      console.error('Request failed:', err.message);
    }
  }
})();
