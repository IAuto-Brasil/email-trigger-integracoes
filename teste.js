const axios = require("axios");

const companyIds = [
  116, 112, 114, 111, 113, 117, 115,
  127, 134, 128, 130, 125, 123, 132, 131, 133, 120, 126,
  149, 139, 137, 136, 141, 142, 150, 138, 143, 135, 144, 140, 147, 148, 132, 135
];

const BASE_URL = "https://email-trigger-app.q60ybw.easypanel.host/api/create-email/";
const AUTH_TOKEN = "630f4367aa75d640ca95e5153142f3cb5f5a0421da5777b1095a0a59f2f30a50";

async function triggerEmails() {
  for (const id of companyIds) {
    try {
      const res = await axios.post(`${BASE_URL}${id}`, {}, {
        headers: {
          Authorization: AUTH_TOKEN,
        },
      });
      console.log(`✅ Empresa ${id}:`, res.data.message);
    } catch (err) {
      console.error(`❌ Erro na empresa ${id}:`, err.response?.data || err.message);
    }
  }
}

triggerEmails();
