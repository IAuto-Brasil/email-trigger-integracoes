const axios = require("axios");

const ids = [
  69, 85, 107, 22, 111, 5, 113, 42, 68, 108, 109, 110, 7, 14, 60, 116, 115, 65,
  104, 19, 57, 62, 21, 112, 25, 27, 49, 63, 101, 97, 40, 47, 52, 67, 84, 33, 36,
  61, 79, 43, 10, 116, 112, 114, 111, 113, 117, 115, 127, 134, 128, 130, 125,
  123, 132, 131, 133, 120, 126, 149, 139, 137, 136, 141, 142, 150, 138, 143,
  135, 144, 140, 147, 148, 132, 135,
];

const API_URL_CREATE =
  "https://email-trigger-app.q60ybw.easypanel.host/api/create-email"; // ajuste se necessário

const AUTH_TOKEN =
  "630f4367aa75d640ca95e5153142f3cb5f5a0421da5777b1095a0a59f2f30a50";

async function createEmails() {
  for (const id of ids) {
    try {
      const response = await axios.post(
        `${API_URL_CREATE}/${id}`,
        {},
        {
          headers: {
            Authorization: AUTH_TOKEN,
          },
        }
      );
      console.log(`ID ${id} ->`, response.data);
    } catch (error) {
      console.error(`Erro no ID ${id}:`, error.response?.data || error.message);
    }
  }
}

createEmails();
