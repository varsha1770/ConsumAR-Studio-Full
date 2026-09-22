const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const form = new FormData();
    const imgBuffer = fs.readFileSync(path.join(__dirname, 'public', 'TIFLabs-Logo.png'));
    
    form.append('images', imgBuffer, { filename: 'TIFLabs-Logo.png', contentType: 'image/png' });
    
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
