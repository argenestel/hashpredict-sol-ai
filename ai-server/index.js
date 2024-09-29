import express from 'express';
import { OpenAI } from 'openai';
import { AptosClient, AptosAccount, HexString } from 'aptos';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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

// Aptos Configuration
const NODE_URL = process.env.APTOS_NODE_URL || "https://fullnode.devnet.aptoslabs.com";
const aptosClient = new AptosClient(NODE_URL, {
    WITH_CREDENTIALS: false
});

const MODULE_ADDRESS = '0xe5daef3712e9be57eee01a28e4b16997e89e0b446546d304d5ec71afc9d1bacd';
const MODULE_NAME = 'hashpredictalpha';

// Create an Aptos account from private key
const privateKey = new HexString(process.env.PRIVATE_KEY_APTOS);
const account = new AptosAccount(privateKey.toUint8Array());

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

async function getPredictionDetails(predictionId) {
    try {
        const result = await aptosClient.view({
            function: `${MODULE_ADDRESS}::${MODULE_NAME}::get_prediction`,
            type_arguments: [],
            arguments: [predictionId]
        });
        console.log("Prediction Details:", JSON.stringify(result, null, 2));
        return result;
    } catch (error) {
        console.error("Error in getPredictionDetails:", error);
        // If HTTP/2 is not supported, try fallback to HTTP/1.1
        if (error.message.includes("h2 is not supported")) {
            console.log("Attempting fallback to HTTP/1.1");
            const fallbackClient = new AptosClient(NODE_URL, {
                WITH_CREDENTIALS: false,
                HTTP2: false
            });
            const fallbackResult = await fallbackClient.view({
                function: `${MODULE_ADDRESS}::${MODULE_NAME}::get_prediction`,
                type_arguments: [],
                arguments: [predictionId]
            });
            console.log("Fallback Prediction Details:", JSON.stringify(fallbackResult, null, 2));
            return fallbackResult;
        }
        throw error;
    }
}

async function finalizePredictionOnChain(predictionId, outcome) {
    const payload = {
        function: `${MODULE_ADDRESS}::${MODULE_NAME}::resolve_prediction`,
        type_arguments: [],
        arguments: [predictionId, outcome]
    };

    try {
        const txnRequest = await aptosClient.generateTransaction(account.address(), payload);
        const signedTxn = await aptosClient.signTransaction(account, txnRequest);
        const txnResult = await aptosClient.submitTransaction(signedTxn);
        await aptosClient.waitForTransaction(txnResult.hash);
        return txnResult;
    } catch (error) {
        console.error("Error in finalizePredictionOnChain:", error);
        throw error;
    }
}

app.post("/finalize-prediction/:id", async (req, res) => {
    try {
        const predictionId = req.params.id;

        console.log(`Attempting to finalize prediction ${predictionId}`);

        // Get prediction details from Aptos
        let predictionDetailsArray;
        try {
            predictionDetailsArray = await getPredictionDetails(predictionId);
        } catch (error) {
            console.error("Error fetching prediction details:", error);
            return res.status(500).json({ error: "Failed to fetch prediction details", details: error.message });
        }

        if (!Array.isArray(predictionDetailsArray) || predictionDetailsArray.length === 0) {
            console.error("Invalid prediction data:", predictionDetailsArray);
            return res.status(404).json({ error: "Prediction not found" });
        }

        const predictionDetails = predictionDetailsArray[0];
        const description = predictionDetails.description;

        if (!description) {
            console.error("Prediction description is undefined:", predictionDetails);
            return res.status(500).json({ error: "Invalid prediction data", details: "Description is undefined" });
        }

        console.log(`Finalizing prediction ${predictionId}: ${description}`);

        let currentData;
        try {
            currentData = await getPerplexityData(description);
        } catch (error) {
            console.error("Error fetching current data:", error);
            return res.status(500).json({ error: "Failed to fetch current data", details: error.message });
        }

        let outcome;
        try {
            outcome = await determineOutcome(description, currentData);
        } catch (error) {
            console.error(`Error determining outcome for prediction ${predictionId}:`, error);
            return res.status(500).json({ error: "Failed to determine outcome", details: error.message });
        }

        console.log(`Determined outcome for prediction ${predictionId}:`, outcome);

        try {
            const txnResult = await finalizePredictionOnChain(predictionId, outcome.outcome);
            console.log(`Finalized prediction ${predictionId} with transaction hash:`, txnResult.hash);
            res.json({ 
                message: `Prediction ${predictionId} finalized successfully`,
                outcome: outcome,
                transactionHash: txnResult.hash
            });
        } catch (error) {
            console.error(`Error finalizing prediction ${predictionId} on the blockchain:`, error);
            res.status(500).json({ error: "Failed to finalize prediction on the blockchain", details: error.message });
        }
    } catch (error) {
        console.error("Error in finalize-prediction endpoint:", error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});


async function claimDailyReward(userAddress) {
    const payload = {
        function: `${MODULE_ADDRESS}::reward_system::claim_daily_reward`,
        type_arguments: [],
        arguments: [userAddress]
    };

    try {
        const txnRequest = await aptosClient.generateTransaction(account.address(), payload);
        const signedTxn = await aptosClient.signTransaction(account, txnRequest);
        const txnResult = await aptosClient.submitTransaction(signedTxn);
        await aptosClient.waitForTransaction(txnResult.hash);
        return txnResult;
    } catch (error) {
        console.error("Error in claimDailyReward:", error);
        throw error;
    }
}

async function useReferralCode(userAddress, referralCode) {
    const payload = {
        function: `${MODULE_ADDRESS}::reward_system::use_referral_code`,
        type_arguments: [],
        arguments: [userAddress, referralCode]
    };

    try {
        const txnRequest = await aptosClient.generateTransaction(account.address(), payload);
        const signedTxn = await aptosClient.signTransaction(account, txnRequest);
        const txnResult = await aptosClient.submitTransaction(signedTxn);
        await aptosClient.waitForTransaction(txnResult.hash);
        return txnResult;
    } catch (error) {
        console.error("Error in useReferralCode:", error);
        throw error;
    }
}

async function getReferrals(userAddress) {
    try {
        const result = await aptosClient.view({
            function: `${MODULE_ADDRESS}::reward_system::get_referrals`,
            type_arguments: [],
            arguments: [userAddress]
        });
        return result[0];
    } catch (error) {
        console.error("Error in getReferrals:", error);
        throw error;
    }
}

async function getDailyClaimInfo(userAddress) {
    try {
        const result = await aptosClient.view({
            function: `${MODULE_ADDRESS}::reward_system::get_daily_claim_info`,
            type_arguments: [],
            arguments: [userAddress]
        });
        return { lastClaimTime: result[0], currentStreak: result[1] };
    } catch (error) {
        console.error("Error in getDailyClaimInfo:", error);
        throw error;
    }
}

// New endpoints
app.post("/claim-daily-reward", async (req, res) => {
    try {
        const { userAddress } = req.body;
        const result = await claimDailyReward(userAddress);
        res.json({ success: true, transactionHash: result.hash });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/use-referral-code", async (req, res) => {
    try {
        const { userAddress, referralCode } = req.body;
        const result = await useReferralCode(userAddress, referralCode);
        res.json({ success: true, transactionHash: result.hash });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/get-referrals/:userAddress", async (req, res) => {
    try {
        const { userAddress } = req.params;
        const referrals = await getReferrals(userAddress);
        res.json({ referrals });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/get-daily-claim-info/:userAddress", async (req, res) => {
    try {
        const { userAddress } = req.params;
        const claimInfo = await getDailyClaimInfo(userAddress);
        res.json(claimInfo);
    } catch (error) {
        res.status(500).json({ error: error.message });
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
        console.log("Received request to generate test predictions");
        const { topic } = req.body;
        if (!topic) {
            return res.status(400).json({ error: "Topic is required" });
        }

        console.log("Generating test predictions for topic:", topic);
        const predictions = await generatePredictions(topic);
        console.log("Generated test predictions:", predictions);

        res.json({ predictions: predictions });
    } catch (error) {
        console.error("Error in test generate-predictions endpoint:", error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});


app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});