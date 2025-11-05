const axios = require("axios");

const ids = [
  49, 69, 127, 141, 85, 139, 149, 137, 150, 144, 109, 114, 155, 99, 152, 22,
  154, 138, 143, 25, 135, 142, 11, 62, 128, 112, 84, 65, 156, 104, 136, 134, 50,
  130, 111, 60, 52, 63, 61, 42, 140, 27, 125, 157, 147, 2, 132, 97, 122, 117,
  148, 113, 67, 131, 153, 101, 108, 110, 47, 115, 123, 16, 57, 66, 35, 120, 126,
  107, 43, 79, 15,
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
