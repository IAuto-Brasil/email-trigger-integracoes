import OpenAI from "openai";
import "dotenv/config";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default client;
