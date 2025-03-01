import { Action, ActionExample, Content, generateText, HandlerCallback, IAgentRuntime, Memory, ModelClass, State } from "@elizaos/core";
import { z } from "zod";

// Define input schema for topup action
const TopUpInput = z.object({
    Fiat_Currency: z.string().describe("The fiat currency to use (e.g., USD, EUR)"),
    Crypto_Currency: z.string().describe("The cryptocurrency to purchase (e.g., BTC, ETH)"),
    Fiat_Amount: z.number().positive().describe("The amount of fiat currency to spend"),
    Payment_Method: z.string().describe("The payment method to use (e.g., bank_transfer, credit_card)")
}).strip().describe("Instructions for topping up crypto with fiat");

// Example topup action
export const topup: Action = {
    name: "TOP_UP", 
    similes: ["topup", "top up", "add money", "buy crypto", "deposit funds"],
    description: "Top up your account by converting fiat money to cryptocurrency",
    suppressInitialMessage: false,

    // Validate if this action should be used
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return true;
    },

    // Handle the action execution
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: { [key: string]: unknown },
        callback: HandlerCallback,
    ) => {
        try {
            // Log the original message for debugging
            console.log("Original message:", message.content.text);
            
            // Extract parameters from message content with more explicit instructions
            const context = `
            Extract the following information from the message:
            1. Fiat currency symbol (e.g., USD, EUR)
            2. Cryptocurrency symbol (e.g., BTC, ETH)
            3. Fiat amount (numeric value)
            4. Payment method (e.g., bank_transfer, credit_card, debit_card)
            
            Message: ${message.content.text}
            
            Format your response as: "Fiat: [currency], Crypto: [currency], Amount: [amount], Payment: [method]"
            `;
            
            const extractedParams = await generateText({
                runtime: runtime,
                context: context,
                modelClass: ModelClass.SMALL,
                stop: ["\n"],
            });
            
            console.log("Raw extracted parameters:", extractedParams);

            // First, try to extract directly from the original message
            const directParams = extractDirectFromMessage(message.content.text || "");
            console.log("Direct extraction from message:", directParams);
            
            // Then parse the model's structured response
            const modelParams = extractTopUpParams(extractedParams);
            console.log("Model extraction result:", modelParams);
            
            // Combine the results, prioritizing direct extraction for numeric values
            const parsedParams = {
                Fiat_Currency: directParams.Fiat_Currency || modelParams.Fiat_Currency || "USD",
                Crypto_Currency: directParams.Crypto_Currency || modelParams.Crypto_Currency || "BTC",
                Fiat_Amount: directParams.Fiat_Amount || modelParams.Fiat_Amount || 100,
                Payment_Method: directParams.Payment_Method || modelParams.Payment_Method || ""
            };
            
            console.log("Final combined parameters:", parsedParams);
            
            // Check if payment method is missing
            if (!parsedParams.Payment_Method || parsedParams.Payment_Method.trim() === '') {
                const promptMessage: Memory = {
                    userId: message.userId,
                    agentId: message.agentId,
                    roomId: message.roomId,
                    content: {
                        text: "Please specify your preferred payment method (e.g., bank_transfer, credit_card, debit_card).",
                        action: "TOP_UP",
                        source: message.content.source,
                    } as Content,
                };
                
                await runtime.messageManager.createMemory(promptMessage);
                callback(promptMessage.content);
                return true;
            }
            
            // Process payment with the specified method
            const onRamp = processPayment(parsedParams.Payment_Method);
            
            // Format response with extracted parameters
            const responseText = `Processing top-up request:
- Fiat Currency: ${parsedParams.Fiat_Currency}
- Crypto Currency: ${parsedParams.Crypto_Currency}
- Amount: ${parsedParams.Fiat_Amount}
- Payment Method: ${parsedParams.Payment_Method}

Transaction status: ${onRamp ? "Successful" : "Failed"}`;

            const newMemory: Memory = {
                userId: message.userId,
                agentId: message.agentId,
                roomId: message.roomId,
                content: {
                    text: responseText,
                    action: "TOP_UP",
                    source: message.content.source,
                } as Content,
            };

            await runtime.messageManager.createMemory(newMemory);
            callback(newMemory.content);

            return true;            
        } catch (error) {
            callback({
                text: `An error occurred during the top-up process: ${error}`
            });
            return false;
        }
    },

    // Example usage patterns
    examples: [
        [
            {
                user: "{{user1}}",
                content: { 
                    text: "I want to top up my account with $100 USD to buy Bitcoin." 
                }
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you top up your account with $100 USD to buy Bitcoin. Let me process that for you.",
                    action: "TOP_UP"
                }
            }
        ],
        [
            {
                user: "{{user1}}",
                content: { 
                    text: "Can I add 50 EUR to my account and convert it to ETH using my credit card?" 
                }
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you add 50 EUR to your account and convert it to ETH using your credit card.",
                    action: "TOP_UP"
                }
            }
        ]
    ] as ActionExample[][],
} as Action;

// Helper functions

function extractTopUpParams(content: string): any {
    // Default values
    const params = {
        Fiat_Currency: "USD",
        Crypto_Currency: "BTC",
        Fiat_Amount: 100,
        Payment_Method: ""
    };
    
    console.log("Parsing content:", content);
    
    // Try to parse structured format first (from model response)
    // Format: "Fiat: [currency], Crypto: [currency], Amount: [amount], Payment: [method]"
    const fiatMatch = content.match(/Fiat:\s*([A-Z]{3})/i);
    if (fiatMatch && fiatMatch[1]) {
        params.Fiat_Currency = fiatMatch[1].toUpperCase();
    }
    
    const cryptoMatch = content.match(/Crypto:\s*([A-Z]{3,4})/i);
    if (cryptoMatch && cryptoMatch[1]) {
        params.Crypto_Currency = cryptoMatch[1].toUpperCase();
    }
    
    const amountMatch = content.match(/Amount:\s*(\d+(\.\d+)?)/i);
    if (amountMatch && amountMatch[1]) {
        params.Fiat_Amount = parseFloat(amountMatch[1]);
    }
    
    const paymentMatch = content.match(/Payment:\s*(\w+(?:_\w+)?)/i);
    if (paymentMatch && paymentMatch[1]) {
        params.Payment_Method = paymentMatch[1].toLowerCase();
    }
    
    // If structured parsing didn't find a payment method, try the fallback approach
    if (!params.Payment_Method) {
        // Check if content mentions a payment method - use comprehensive checks
        const contentLower = content.toLowerCase();
        if (contentLower.includes("credit") || contentLower.includes("credit card") || contentLower.includes("credit_card")) {
            params.Payment_Method = "credit_card";
        } else if (contentLower.includes("bank") || contentLower.includes("bank transfer") || contentLower.includes("bank_transfer")) {
            params.Payment_Method = "bank_transfer";
        } else if (contentLower.includes("debit") || contentLower.includes("debit card") || contentLower.includes("debit_card")) {
            params.Payment_Method = "debit_card";
        } else if (contentLower.includes("paypal") || contentLower.includes("pay pal")) {
            params.Payment_Method = "paypal";
        } else if (contentLower.includes("wire") || contentLower.includes("wire transfer")) {
            params.Payment_Method = "wire_transfer";
        }
    }
    
    // Also try to extract amount if not found in structured format
    if (params.Fiat_Amount === 100) { // If still default value
        const generalAmountMatch = content.match(/(\d+(\.\d+)?)\s*(usd|eur|gbp|jpy|cny)/i);
        if (generalAmountMatch && generalAmountMatch[1]) {
            params.Fiat_Amount = parseFloat(generalAmountMatch[1]);
            if (generalAmountMatch[3]) {
                params.Fiat_Currency = generalAmountMatch[3].toUpperCase();
            }
        }
    }
    
    // Log the extracted parameters for debugging
    console.log("Parsed parameters:", params);
    
    return params;
}

function processPayment(paymentMethod: string): boolean {
    // In a real implementation, this would call a payment processor
    // For test purposes, always return true
    return true;
}

function convertFiatToCrypto(fiatCurrency: string, cryptoCurrency: string, fiatAmount: number): {
    cryptoAmount: number;
    gasFee: number;
    exchangeRate: number;
    transactionId: string;
} {
    // In a real implementation, this would use current exchange rates
    // For this example, we'll use fixed rates
    const exchangeRates: Record<string, Record<string, number>> = {
        "USD": {
            "BTC": 0.000025,
            "ETH": 0.00042
        },
        "EUR": {
            "BTC": 0.000027,
            "ETH": 0.00045
        }
    };
    
    const exchangeRate = exchangeRates[fiatCurrency]?.[cryptoCurrency] || 0.00001;
    const gasFee = fiatAmount * 0.01; // 1% gas fee
    const cryptoAmount = (fiatAmount - gasFee) * exchangeRate;
    
    return {
        cryptoAmount,
        gasFee,
        exchangeRate,
        transactionId: `TX-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
    };
}

async function cacheTransactionResult(runtime: IAgentRuntime, userId: string, result: any): Promise<void> {
    try {
        // In a real implementation, this would store the transaction in a database
        // For this example, we'll just log it
        console.log(`Transaction for user ${userId}:`, result);
    } catch (error) {
        console.error("Error caching transaction result:", error);
    }
}

// Add a new function to extract parameters directly from the message
function extractDirectFromMessage(message: string): any {
    const params = {
        Fiat_Currency: "",
        Crypto_Currency: "",
        Fiat_Amount: 0,
        Payment_Method: ""
    };
    
    // Extract amount - look for numbers followed by currency or standalone numbers
    const amountCurrencyRegex = /(\d+(?:\.\d+)?)\s*(usd|eur|gbp|jpy|cny|dollars|euros)/i;
    const amountMatch = message.match(amountCurrencyRegex) || message.match(/(\d+(?:\.\d+)?)/);
    
    if (amountMatch && amountMatch[1]) {
        params.Fiat_Amount = parseFloat(amountMatch[1]);
        console.log(`Found amount: ${params.Fiat_Amount}`);
        
        // If currency is in the same match, capture it
        if (amountMatch[2]) {
            const currencyMap: {[key: string]: string} = {
                'usd': 'USD',
                'dollars': 'USD',
                'eur': 'EUR',
                'euros': 'EUR',
                'gbp': 'GBP',
                'jpy': 'JPY',
                'cny': 'CNY'
            };
            params.Fiat_Currency = currencyMap[amountMatch[2].toLowerCase()] || amountMatch[2].toUpperCase();
            console.log(`Found currency with amount: ${params.Fiat_Currency}`);
        }
    }
    
    // Extract crypto currency
    const cryptoRegex = /\b(btc|bitcoin|eth|ethereum|xrp|ripple|ltc|litecoin|dot|polkadot)\b/i;
    const cryptoMatch = message.match(cryptoRegex);
    if (cryptoMatch && cryptoMatch[1]) {
        const cryptoMap: {[key: string]: string} = {
            'btc': 'BTC',
            'bitcoin': 'BTC',
            'eth': 'ETH',
            'ethereum': 'ETH',
            'xrp': 'XRP',
            'ripple': 'XRP',
            'ltc': 'LTC',
            'litecoin': 'LTC',
            'dot': 'DOT',
            'polkadot': 'DOT'
        };
        params.Crypto_Currency = cryptoMap[cryptoMatch[1].toLowerCase()] || cryptoMatch[1].toUpperCase();
        console.log(`Found crypto: ${params.Crypto_Currency}`);
    }
    
    // Extract fiat currency if not already found
    if (!params.Fiat_Currency) {
        const fiatRegex = /\b(usd|eur|gbp|jpy|cny|dollars|euros)\b/i;
        const fiatMatch = message.match(fiatRegex);
        if (fiatMatch && fiatMatch[1]) {
            const fiatMap: {[key: string]: string} = {
                'usd': 'USD',
                'dollars': 'USD',
                'eur': 'EUR',
                'euros': 'EUR',
                'gbp': 'GBP',
                'jpy': 'JPY',
                'cny': 'CNY'
            };
            params.Fiat_Currency = fiatMap[fiatMatch[1].toLowerCase()] || fiatMatch[1].toUpperCase();
            console.log(`Found fiat currency: ${params.Fiat_Currency}`);
        }
    }
    
    // Extract payment method
    const messageLower = message.toLowerCase();
    if (messageLower.includes("credit") || messageLower.includes("credit card") || messageLower.includes("credit_card")) {
        params.Payment_Method = "credit_card";
    } else if (messageLower.includes("bank") || messageLower.includes("bank transfer") || messageLower.includes("bank_transfer")) {
        params.Payment_Method = "bank_transfer";
    } else if (messageLower.includes("debit") || messageLower.includes("debit card") || messageLower.includes("debit_card")) {
        params.Payment_Method = "debit_card";
    } else if (messageLower.includes("paypal") || messageLower.includes("pay pal")) {
        params.Payment_Method = "paypal";
    } else if (messageLower.includes("wire") || messageLower.includes("wire transfer")) {
        params.Payment_Method = "wire_transfer";
    }
    
    console.log("Direct extraction results:", params);
    return params;
}
