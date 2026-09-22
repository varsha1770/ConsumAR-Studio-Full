const axios = require('axios');
const FormData = require('form-data');

(async () => {
  try {
    const form = new FormData();
    form.append('images', Buffer.from('dummy data'), { filename: 'test.jpg', contentType: 'image/jpeg' });
    
    console.log('Sending request...');
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
