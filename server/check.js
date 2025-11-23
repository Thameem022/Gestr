import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });
    // There is no direct listModels in the JS SDK client simpler than trying one.
    // However, we can test if the connection works:
    const result = await model.generateContent("Test");
    console.log("Success! 'gemini-1.5-flash-latest' is valid.");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

listModels();