const axios = require("axios");

const ids = [
  139, 69, 127, 141, 85, 60, 149, 137, 130, 128, 150, 67, 114, 27, 65, 112, 152,
  135, 42, 49, 154, 138, 143, 136, 84, 2, 11, 61, 142, 151, 52, 144, 104, 134,
  111, 22, 47, 140, 62, 25, 99, 125, 123, 122, 132, 97, 147, 63, 113, 117, 148,
  131, 50, 108, 153, 101, 110, 109, 115, 16, 57, 66, 35, 120, 126, 107, 43, 79,
  15,
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
