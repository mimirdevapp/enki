import formidable from "formidable";
import fs from "fs/promises";

// Disable Next.js default body parsing (important for file uploads)
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper: convert file buffer to Base64
async function convertImageToBase64(filePath) {
  const fileData = await fs.readFile(filePath);
  return fileData.toString("base64");
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // Parse form-data (image file)
    const form = formidable({});
    const [fields, files] = await form.parse(req);
    const file = files.file?.[0];

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Convert uploaded image to Base64
    const base64Image = await convertImageToBase64(file.filepath);

    // OpenAI API call
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
      return res.status(500).json({ error: "Missing server configuration" });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this bill/receipt image and extract the following information in JSON format:
{
  "total": <total bill amount as number>,
  "items": [{"name": "<item name>", "price": <price as number>}],
  "tax": <tax amount as number, or 0 if not present>,
  "serviceFee": <service fee/charge as number, or 0 if not present>,
  "tips": <tips amount as number, or 0 if not present>,
  "discount": <discount amount as number, or 0 if not present>
}

Extract all line items from the bill. If you cannot determine exact values, use 0. Return ONLY the JSON object, no other text.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to process image");
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Extract JSON from GPT response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse bill data from image");
    }

    const billData = JSON.parse(jsonMatch[0]);
    console.log("Successfully parsed bill:", { billData });
    res.status(200).json({
      success: true,
      billData,
    });
  } catch (err) {
    console.error("Error processing image:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
}
