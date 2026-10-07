import "dotenv/config";
import { GoogleGenAI, Type } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export type AIRecommendation = {
  action: "HARVEST_KEYWORD" | "ADD_NEGATIVE_KEYWORD";
  title: string;
  description: string;
  reason: string;
  expectedImpact: string;
  confidence: number;
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  modelUsed?: string;
};

const recommendationSchema = {
  type: Type.OBJECT,
  properties: {
    action: {
      type: Type.STRING,
      enum: ["HARVEST_KEYWORD", "ADD_NEGATIVE_KEYWORD"],
    },
    title: {
      type: Type.STRING,
    },
    description: {
      type: Type.STRING,
    },
    reason: {
      type: Type.STRING,
    },
    expectedImpact: {
      type: Type.STRING,
    },
    confidence: {
      type: Type.NUMBER,
      description: "Confidence from 0 to 1.",
    },
    risk: {
      type: Type.STRING,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
    },
  },
  required: [
    "action",
    "title",
    "description",
    "reason",
    "expectedImpact",
    "confidence",
    "risk",
  ],
};

type SearchTermInput = {
  value: string;
  classification: string;
  clicks: number;
  orders: number;
  spend: number;
  sales: number;
  acos: number;
};

export async function generateSearchTermRecommendation(
  searchTerm: SearchTermInput
): Promise<AIRecommendation> {
  const ai = getAiClient();
  const modelName = "gemini-3.5-flash-lite";

  // Safe fallback if Gemini is not configured
  if (!ai) {
    return getFallbackSearchTermRecommendation(searchTerm);
  }

  const prompt = `
You are the recommendation reasoning layer of an Amazon advertising optimization system.
You DO NOT execute Amazon API actions.
You MUST reason only from the supplied performance data.
The deterministic system has already classified this search term. Do not override the classification.
Your job is to produce a concise recommendation explanation and confidence/risk assessment.

Rules:
1. WINNER search terms with conversions should normally recommend HARVEST_KEYWORD.
2. WASTE search terms with enough clicks and zero orders should normally recommend ADD_NEGATIVE_KEYWORD.
3. Do not invent metrics.
4. Do not recommend bid changes.
5. Do not recommend budget changes.
6. Do not invent revenue or profit projections.
7. Confidence must be between 0 and 1.
8. Risk must be LOW, MEDIUM, HIGH, or CRITICAL.
9. Keep the explanation grounded in the supplied numbers.

Search term data:
${JSON.stringify(searchTerm, null, 2)}
`;

  try {
    // Add timeout promise to guard against remote API delays
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini API call timed out after 10s")), 10000)
    );

    const callPromise = ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: recommendationSchema,
      },
    });

    const response = await Promise.race([callPromise, timeoutPromise]);

    if (!response.text) {
      throw new Error("Gemini returned an empty response.");
    }

    const parsed = JSON.parse(response.text) as AIRecommendation;

    // Strict schema & value validation
    if (!["HARVEST_KEYWORD", "ADD_NEGATIVE_KEYWORD"].includes(parsed.action)) {
      throw new Error("Gemini returned an unsupported action.");
    }

    if (!Number.isFinite(parsed.confidence) || parsed.confidence < 0 || parsed.confidence > 1) {
      parsed.confidence = 0.85;
    }

    if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(parsed.risk)) {
      parsed.risk = "LOW";
    }

    return {
      ...parsed,
      modelUsed: modelName,
    };
  } catch (error) {
    console.warn("Gemini reasoning failed or timed out. Falling back to deterministic copy:", error);
    return getFallbackSearchTermRecommendation(searchTerm);
  }
}

function getFallbackSearchTermRecommendation(searchTerm: SearchTermInput): AIRecommendation {
  if (searchTerm.orders > 0 || searchTerm.classification === "WINNER") {
    return {
      action: "HARVEST_KEYWORD",
      title: `Harvest winning search term: "${searchTerm.value}"`,
      description: `This search term generated ${searchTerm.orders} orders with an ACoS of ${(searchTerm.acos * 100).toFixed(1)}%.`,
      reason: "Converting search term meets criteria for promotion to exact keyword targeting.",
      expectedImpact: "Capture high-intent shoppers with dedicated keyword budget allocation.",
      confidence: Math.min(0.95, 0.75 + searchTerm.orders * 0.05),
      risk: "LOW",
      modelUsed: "deterministic-rules-fallback",
    };
  }

  return {
    action: "ADD_NEGATIVE_KEYWORD",
    title: `Block non-converting search term: "${searchTerm.value}"`,
    description: `Search term accumulated ${searchTerm.clicks} clicks and ₹${searchTerm.spend.toFixed(0)} spend with 0 orders.`,
    reason: "Zero conversions with statistically significant click volume indicates wasted ad spend.",
    expectedImpact: "Eliminate wasteful ad spend and improve campaign overall ACoS.",
    confidence: Math.min(0.95, 0.7 + searchTerm.clicks * 0.01),
    risk: "LOW",
    modelUsed: "deterministic-rules-fallback",
  };
}

export type AIBidRecommendation = {
  action: "INCREASE_BID" | "DECREASE_BID" | "NO_ACTION";
  title: string;
  description: string;
  reason: string;
  expectedImpact: string;
  confidence: number;
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  modelUsed?: string;
};

export async function generateBidRecommendation(input: {
  keyword: string;
  currentBid: number;
  clicks: number;
  orders: number;
  spend: number;
  sales: number;
  acos: number;
  targetAcos: number;
  strategyMode: "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE";
  maxBidChange: number;
}): Promise<AIBidRecommendation> {
  const ai = getAiClient();
  const modelName = "gemini-3.5-flash-lite";

  if (!ai) {
    return getFallbackBidRecommendation(input);
  }

  const prompt = `
You are the PPC strategy reasoning layer for Amazon AI Autopilot.
You NEVER execute Amazon API actions.
Analyze this keyword's performance and return exactly one recommendation.

Keyword: ${input.keyword}
Current bid: ₹${input.currentBid.toFixed(2)}
Clicks: ${input.clicks}
Orders: ${input.orders}
Spend: ₹${input.spend.toFixed(2)}
Sales: ₹${input.sales.toFixed(2)}
ACoS: ${(input.acos * 100).toFixed(1)}%
Target ACoS: ${(input.targetAcos * 100).toFixed(1)}%
Strategy mode: ${input.strategyMode}
Maximum allowed bid change: ${input.maxBidChange}%

Rules:
- Never invent metrics.
- Never recommend a bid change greater than the supplied maximum.
- Never recommend a bid change greater than 15%.
- Strong conversion and ACoS below target can justify INCREASE_BID.
- Poor efficiency and ACoS above target can justify DECREASE_BID.
- Insufficient data should result in NO_ACTION.
- The deterministic safety engine remains authoritative.
- The LLM only explains the reasoning.
- Confidence must be between 0 and 1.
- Risk must be LOW, MEDIUM, HIGH, or CRITICAL.

Return structured JSON only.
`;

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini API call timed out after 10s")), 10000)
    );

    const callPromise = ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: {
              type: Type.STRING,
              enum: ["INCREASE_BID", "DECREASE_BID", "NO_ACTION"],
            },
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            reason: { type: Type.STRING },
            expectedImpact: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            risk: {
              type: Type.STRING,
              enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
            },
          },
          required: [
            "action",
            "title",
            "description",
            "reason",
            "expectedImpact",
            "confidence",
            "risk",
          ],
        },
      },
    });

    const response = await Promise.race([callPromise, timeoutPromise]);

    if (!response.text) {
      throw new Error("Gemini returned an empty response.");
    }

    const parsed = JSON.parse(response.text) as AIBidRecommendation;

    if (!["INCREASE_BID", "DECREASE_BID", "NO_ACTION"].includes(parsed.action)) {
      throw new Error("Gemini returned invalid action.");
    }

    if (!Number.isFinite(parsed.confidence) || parsed.confidence < 0 || parsed.confidence > 1) {
      parsed.confidence = 0.8;
    }

    if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(parsed.risk)) {
      parsed.risk = "LOW";
    }

    return {
      ...parsed,
      modelUsed: modelName,
    };
  } catch (err) {
    console.warn("Gemini bid reasoning failed or timed out. Using deterministic fallback:", err);
    return getFallbackBidRecommendation(input);
  }
}

function getFallbackBidRecommendation(input: {
  keyword: string;
  currentBid: number;
  clicks: number;
  orders: number;
  spend: number;
  sales: number;
  acos: number;
  targetAcos: number;
}): AIBidRecommendation {
  if (input.acos < input.targetAcos && input.orders >= 3) {
    return {
      action: "INCREASE_BID",
      title: "Increase Bid on High-Performing Keyword",
      description: `Keyword "${input.keyword}" has an ACoS of ${(input.acos * 100).toFixed(1)}%, beating target ${(input.targetAcos * 100).toFixed(1)}%.`,
      reason: "High efficiency converter justifies bid expansion within deterministic 15% safety limit.",
      expectedImpact: "Increase impression share and order velocity while maintaining target profitability.",
      confidence: 0.85,
      risk: "LOW",
      modelUsed: "deterministic-rules-fallback",
    };
  }

  if (input.acos > input.targetAcos * 1.2 && input.orders >= 2) {
    return {
      action: "DECREASE_BID",
      title: "Decrease Bid on Inefficient Keyword",
      description: `Keyword "${input.keyword}" has an ACoS of ${(input.acos * 100).toFixed(1)}%, exceeding target ${(input.targetAcos * 100).toFixed(1)}%.`,
      reason: "High advertising spend relative to sales requires bid reduction to restore profitable margins.",
      expectedImpact: "Reduce wasted ad spend and bring ACoS closer to target.",
      confidence: 0.8,
      risk: "LOW",
      modelUsed: "deterministic-rules-fallback",
    };
  }

  return {
    action: "NO_ACTION",
    title: "Maintain Current Bid",
    description: `Performance metrics for "${input.keyword}" are within normal variance range.`,
    reason: "No bid adjustment warranted based on current conversion volume.",
    expectedImpact: "Maintain steady campaign delivery.",
    confidence: 0.7,
    risk: "LOW",
    modelUsed: "deterministic-rules-fallback",
  };
}