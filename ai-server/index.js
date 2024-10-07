import express from 'express';
import { OpenAI } from 'openai';
import { Connection, PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, web3 } from '@project-serum/anchor';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import bs58 from 'bs58';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// OpenAI Configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Solana Configuration
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const connection = new Connection(web3.clusterApiUrl(SOLANA_NETWORK), 'confirmed');
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID);
const MARKET_STATE_PUBKEY = new PublicKey(process.env.MARKET_STATE_PUBKEY);

// Create a Solana wallet from private key
const privateKey = bs58.decode(process.env.PRIVATE_KEY_SOLANA);
const wallet = Keypair.fromSecretKey(privateKey);

// Initialize Anchor provider
const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());

// Load the program IDL
const idl = JSON.parse(fs.readFileSync(path.join(__dirname, './programsidl.json'), 'utf8'));
const program = new Program(idl, PROGRAM_ID, provider);

async function getPerplexityData(query) {
    try {
        const response = await axios.post('https://api.perplexity.ai/chat/completions', {
            model: "llama-3.1-sonar-small-128k-online",
            messages: [
                { 
                    role: "system", 
                    content: "You are a highly knowledgeable assistant tasked with providing the most recent and relevant information on a given topic. Focus on factual, verifiable data from reliable sources. Include specific numbers, dates, and key events where applicable."
                },
                { 
                    role: "user", 
                    content: `Provide the most up-to-date and relevant information on the following topic: ${query}. Include recent developments, statistics, and expert opinions if available. Format the information in a clear, concise manner.`
                }
            ],
            max_tokens: 300,
            temperature: 0.5,
            top_p: 0.9,
            return_citations: true,
            search_domain_filter: ["perplexity.ai"],
            return_images: false,
            return_related_questions: false,
            search_recency_filter: "week",
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        console.log("Perplexity API Response:", JSON.stringify(response.data, null, 2));
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error("Error fetching data from Perplexity:", error.response ? error.response.data : error.message);
        throw new Error("Failed to fetch data from Perplexity: " + (error.response ? JSON.stringify(error.response.data) : error.message));
    }
}

async function determineOutcome(description, currentData) {
    try {
        const prompt = `
Analyze the following prediction and the most recent related information to determine its outcome:

Prediction: "${description}"

Current Information:
${currentData}

Based on this data, has the prediction come true? Respond in the following format:
1. A single digit: 0 if the prediction is false or has not occurred, 1 if it is true or has occurred.
2. A confidence score between 0 and 1 (e.g., 0.8 for 80% confidence).
3. A brief explanation (max 50 words) of your reasoning.

Example response:
1
0.9
Bitcoin has surpassed $50,000 on multiple major exchanges according to current market data, meeting the prediction criteria with high confidence.

Your response:
`;
        
        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                { 
                    role: "system", 
                    content: "You are an impartial judge tasked with determining the outcomes of prediction markets based on the most current and relevant information available. Provide concise and accurate assessments."
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.1,
        });

        console.log("OpenAI API Response:", JSON.stringify(response, null, 2));

        const fullResponse = response.choices[0].message.content.trim();
        console.log("Full AI Response:", fullResponse);

        const [outcome, confidence, ...explanationParts] = fullResponse.split('\n');
        
        if (!outcome || !confidence) {
            throw new Error("Invalid AI response format: " + fullResponse);
        }

        return {
            outcome: parseInt(outcome),
            confidence: parseFloat(confidence),
            explanation: explanationParts.join(' ').trim() || "No explanation provided"
        };
    } catch (error) {
        console.error("Error determining outcome:", error);
        throw new Error("Failed to determine outcome: " + error.message);
    }
}

// Function to list all predictions
async function listAllPredictions() {
    try {
        const predictions = await program.account.prediction.all();
        console.log("All Predictions:", predictions.map(p => ({
            publicKey: p.publicKey.toBase58(),
            id: p.account.id.toString(),
            description: p.account.description
        })));
        return predictions;
    } catch (error) {
        console.error("Error listing predictions:", error);
        throw new Error(`Failed to list predictions: ${error.message}`);
    }
}

// Fetch prediction details using its public key
async function getPredictionDetailsViaPublicKey(predictionId) {
    try {
        const predictions = await listAllPredictions();
        const prediction = predictions.find(p => p.account.id.toString() === predictionId);
        
        if (!prediction) {
            console.error(`Prediction with ID ${predictionId} not found`);
            return null;
        }

        console.log("Prediction Details:", JSON.stringify(prediction, null, 2));
        return prediction;
    } catch (error) {
        console.error("Error in getPredictionDetailsViaPublicKey:", error);
        throw new Error(`Failed to get prediction details: ${error.message}`);
    }
}

app.post("/finalize-prediction/:id", async (req, res) => {
    try {
        const predictionId = req.params.id;

        console.log(`Preparing finalization data for prediction ${predictionId}`);

        let predictionDetails;
        try {
            predictionDetails = await getPredictionDetailsViaPublicKey(predictionId);
        } catch (error) {
            console.error("Error fetching prediction details:", error);
            return res.status(500).json({ error: "Failed to fetch prediction details", details: error.message });
        }

        if (!predictionDetails) {
            console.error(`Prediction with ID ${predictionId} not found`);
            return res.status(404).json({ error: "Prediction not found" });
        }

        const description = predictionDetails.account.description;

        if (!description) {
            console.error("Prediction description is undefined:", predictionDetails.account);
            return res.status(500).json({ error: "Invalid prediction data", details: "Description is undefined" });
        }

        console.log(`Preparing finalization data for prediction ${predictionId}: ${description}`);

        const currentData = await getPerplexityData(description);
        const outcome = await determineOutcome(description, currentData);

        res.json({
            aiOutcome: outcome,
            currentData: currentData,
        });

    } catch (error) {
        console.error("Error in finalize-prediction endpoint:", error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// New endpoint to actually finalize the prediction
app.post("/execute-finalization/:id", async (req, res) => {
    try {
        const predictionId = req.params.id;
        const { finalOutcome } = req.body;

        if (finalOutcome === undefined) {
            return res.status(400).json({ error: "Final outcome is required" });
        }

        const predictionDetails = await getPredictionDetailsViaPublicKey(predictionId);

        const tx = await program.methods
            .resolvePrediction({ [finalOutcome ? 'true' : 'false']: {} })
            .accounts({
                marketState: MARKET_STATE_PUBKEY,
                prediction: predictionDetails.publicKey,
                admin: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        await program.provider.connection.confirmTransaction(tx, "confirmed");
        console.log(`Finalized prediction ${predictionId} with transaction signature:`, tx);
        res.json({
            message: `Prediction ${predictionId} finalized successfully`,
            outcome: finalOutcome,
            transactionSignature: tx
        });
    } catch (error) {
        console.error(`Error finalizing prediction ${predictionId} on the blockchain:`, error);
        res.status(500).json({ error: "Failed to finalize prediction on the blockchain", details: error.message });
    }
});

async function generatePredictions(topic) {
    try {
        const perplexityData = await getPerplexityData(topic);

        const gpt4Prompt = `
Based on the following current information about ${topic}:

${perplexityData}

Generate 3 prediction market questions. Each prediction should be:
1. Specific and unambiguous
2. Measurable with a clear outcome
3. Have a definite timeframe for resolution (within the next 6 months)
4. Relevant to the given topic and current events
5. Interesting and engaging for participants

Output should be a valid JSON array of prediction objects with the following fields:
- description: The prediction question
- duration: Time until the prediction resolves, in seconds (max 6 months)
- tags: An array of relevant tags (3-5 tags)

Ensure the predictions are diverse and cover different aspects of the topic.
`;

        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: "You are an expert in creating engaging and relevant prediction market questions based on current events and data."
                },
                { role: "user", content: gpt4Prompt }
            ],
            temperature: 0.7,
        });

        let predictions = JSON.parse(response.choices[0].message.content);
        return predictions.map(prediction => ({
            ...prediction,
            minVotes: 1,
            maxVotes: 1000,
            predictionType: 0,
            optionsCount: 2
        }));
    } catch (error) {
        console.error("Error generating predictions:", error);
        throw new Error("Failed to generate predictions: " + error.message);
    }
}

app.post("/test/generate-predictions", async (req, res) => {
    try {
        const { topic } = req.body;
        if (!topic) {
            return res.status(400).json({ error: "Topic is required" });
        }

        const predictions = await generatePredictions(topic);
        res.json({ predictions: predictions });
    } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
