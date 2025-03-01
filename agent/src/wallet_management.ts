import { Action, ActionExample, Content, generateText, HandlerCallback, IAgentRuntime, Memory, ModelClass, State } from "@elizaos/core";
import { z } from "zod";

// Define input schema for wallet management action
const WalletManagementInput = z.object({
    action: z.enum([
        "create_wallet",
        "get_details",
        "transfer_funds"
    ]).describe("The type of action to perform"),
    
    // Wallet Creation Parameters
    walletType: z.enum([
        "checking",
        "saving",
        "sharing",
        "specific_purpose",
        "secret"
    ]).optional().describe("The type of wallet to create"),
    
    walletName: z.string().optional().describe("Name for the wallet"),
    purpose: z.string().optional().describe("Purpose for specific_purpose wallets"),
    
    // Network Configuration
    network: z.enum([
        "ethereum",
        "polygon",
        "arbitrum",
        "optimism",
        "base",
        "solana"
    ]).default("ethereum").describe("Blockchain network for the wallet"),
    
    // Transaction Parameters
    transactionParams: z.object({
        recipient: z.string(),
        amount: z.number(),
        memo: z.string().optional()
    }).optional()
}).strip().describe("Instructions for wallet management operations");

// Wallet management action
export const walletManagement: Action = {
    name: "WALLET_MANAGEMENT", 
    similes: ["create wallet", "new wallet", "wallet management", "manage wallet", "wallet details"],
    description: "Create and manage different types of wallets",
    suppressInitialMessage: false,

    // Validate if this action should be used (simplified to always return true)
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
            1. Wallet type (e.g., checking, saving, sharing, specific_purpose, secret)
            2. Wallet name (any name the user wants to give to the wallet)
            3. Purpose (for specific_purpose wallets)
            4. Network (e.g., ethereum, polygon, arbitrum, optimism, base, solana)
            
            Message: ${message.content.text}
            
            Format your response as: "Type: [type], Name: [name], Purpose: [purpose], Network: [network]"
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
            const modelParams = parseModelResponse(extractedParams);
            console.log("Model extraction result:", modelParams);
            
            // Combine the results, prioritizing direct extraction
            const params = {
                action: directParams.action || "create_wallet", // Default to create_wallet
                walletType: directParams.walletType || modelParams.walletType || "checking",
                walletName: directParams.walletName || modelParams.walletName || "My New Wallet",
                purpose: directParams.purpose || modelParams.purpose || "",
                network: directParams.network || modelParams.network || "ethereum",
                transactionParams: directParams.transactionParams || null
            };
            
            console.log("Final combined parameters:", params);
            
            // Force create_wallet action for messages containing wallet creation keywords
            if (message.content.text && 
                (message.content.text.toLowerCase().includes("create") || 
                 message.content.text.toLowerCase().includes("new wallet") || 
                 message.content.text.toLowerCase().includes("make a wallet") ||
                 message.content.text.toLowerCase().includes("set up a wallet") ||
                 message.content.text.toLowerCase().includes("account"))) {
                
                params.action = "create_wallet";
                
                // If wallet name is not specified, generate a default name
                if (!params.walletName) {
                    params.walletName = params.walletType ? 
                        `My ${capitalizeFirstLetter(params.walletType)} Wallet` : 
                        "My New Wallet";
                }
            }
            
            // Handle different actions
            switch (params.action) {
                case "create_wallet": {
                    // Validate required parameters
                    if (!params.walletType || !params.walletName) {
                        const missingParams = [];
                        if (!params.walletType) missingParams.push("wallet type");
                        if (!params.walletName) missingParams.push("wallet name");
                        
                        const promptMessage: Memory = {
                            userId: message.userId,
                            agentId: message.agentId,
                            roomId: message.roomId,
                            content: {
                                text: `Please provide the following information: ${missingParams.join(", ")}`,
                                action: "WALLET_MANAGEMENT",
                                source: message.content.source,
                            } as Content,
                        };
                        
                        await runtime.messageManager.createMemory(promptMessage);
                        callback(promptMessage.content);
                        return true;
                    }
                    
                    // For specific_purpose wallets, check if purpose is provided
                    if (params.walletType === "specific_purpose" && !params.purpose) {
                        // Try to extract purpose from the message if not already done
                        if (message.content.text) {
                            const messageLower = message.content.text.toLowerCase();
                            const commonPurposes = [
                                "travel", "vacation", "trip", 
                                "education", "school", "college",
                                "wedding", "marriage", 
                                "emergency", "rainy day",
                                "retirement", 
                                "house", "home", "car"
                            ];
                            
                            for (const purpose of commonPurposes) {
                                if (messageLower.includes(purpose)) {
                                    params.purpose = purpose;
                                    console.log(`Found purpose from message: ${params.purpose}`);
                                    break;
                                }
                            }
                            
                            // If still no purpose, ask the user
                            if (!params.purpose) {
                                const promptMessage: Memory = {
                                    userId: message.userId,
                                    agentId: message.agentId,
                                    roomId: message.roomId,
                                    content: {
                                        text: `You're creating a specific purpose wallet. What is the purpose or goal for this wallet?`,
                                        action: "WALLET_MANAGEMENT",
                                        source: message.content.source,
                                    } as Content,
                                };
                                
                                await runtime.messageManager.createMemory(promptMessage);
                                callback(promptMessage.content);
                                return true;
                            }
                        } else {
                            // Default purpose if we can't extract one
                            params.purpose = "Specific Goal";
                        }
                    }
                    
                    // Create wallet
                    const wallet = createWallet(params);
                    const walletDetails = generateWalletDetails(wallet);
                    
                    // Format response
                    let responseText = `✅ Wallet Created Successfully!

📋 WALLET DETAILS:
${walletDetails}`;

                    // Add specific message for specific_purpose wallets
                    if (params.walletType === "specific_purpose") {
                        responseText += `\n\nYour specific purpose wallet for "${params.purpose}" has been set up. This wallet is designed to help you achieve your goal with features like time lock and restricted use.`;
                    } else {
                        responseText += `\n\nYour new ${params.walletType} wallet "${params.walletName}" is ready to use.`;
                    }

                    const newMemory: Memory = {
                        userId: message.userId,
                        agentId: message.agentId,
                        roomId: message.roomId,
                        content: {
                            text: responseText,
                            action: "WALLET_MANAGEMENT",
                            source: message.content.source,
                        } as Content,
                    };
                    
                    await runtime.messageManager.createMemory(newMemory);
                    callback(newMemory.content);
                    return true;
                }
                
                case "get_details": {
                    // In a real implementation, this would fetch wallet details from storage
                    const wallet = createWallet(params); // Simulated for MVP
                    const details = generateWalletDetails(wallet);
                    
                    const responseText = `📋 WALLET DETAILS:
${details}`;
                    
                    const newMemory: Memory = {
                        userId: message.userId,
                        agentId: message.agentId,
                        roomId: message.roomId,
                        content: {
                            text: responseText,
                            action: "WALLET_MANAGEMENT",
                            source: message.content.source,
                        } as Content,
                    };
                    
                    await runtime.messageManager.createMemory(newMemory);
                    callback(newMemory.content);
                    return true;
                }
                
                case "transfer_funds": {
                    if (!params.transactionParams) {
                        const promptMessage: Memory = {
                            userId: message.userId,
                            agentId: message.agentId,
                            roomId: message.roomId,
                            content: {
                                text: "Please provide transaction details: recipient address and amount.",
                                action: "WALLET_MANAGEMENT",
                                source: message.content.source,
                            } as Content,
                        };
                        
                        await runtime.messageManager.createMemory(promptMessage);
                        callback(promptMessage.content);
                        return true;
                    }
                    
                    // In a real implementation, this would perform the actual transfer
                    const responseText = `Transaction initiated:
• Recipient: ${params.transactionParams.recipient}
• Amount: ${params.transactionParams.amount}
• Network: ${params.network}
${params.transactionParams.memo ? `• Memo: ${params.transactionParams.memo}` : ""}

Transaction is being processed. You will be notified when it completes.`;
                    
                    const newMemory: Memory = {
                        userId: message.userId,
                        agentId: message.agentId,
                        roomId: message.roomId,
                        content: {
                            text: responseText,
                            action: "WALLET_MANAGEMENT",
                            source: message.content.source,
                        } as Content,
                    };
                    
                    await runtime.messageManager.createMemory(newMemory);
                    callback(newMemory.content);
                    return true;
                }
                
                default: {
                    const promptMessage: Memory = {
                        userId: message.userId,
                        agentId: message.agentId,
                        roomId: message.roomId,
                        content: {
                            text: "Please specify a valid action: create_wallet, get_details, or transfer_funds",
                            action: "WALLET_MANAGEMENT",
                            source: message.content.source,
                        } as Content,
                    };
                    
                    await runtime.messageManager.createMemory(promptMessage);
                    callback(promptMessage.content);
                    return true;
                }
            }
        } catch (error) {
            callback({
                text: `An error occurred: ${error}`
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
                    text: "I want to create a new checking wallet called 'Daily Expenses'." 
                }
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you create a new checking wallet called 'Daily Expenses'.",
                    action: "WALLET_MANAGEMENT"
                }
            }
        ],
        [
            {
                user: "{{user1}}",
                content: { 
                    text: "Can I create a wallet for my vacation savings?" 
                }
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you create a specific purpose wallet for your vacation savings.",
                    action: "WALLET_MANAGEMENT"
                }
            }
        ]
    ] as ActionExample[][],
} as Action;

// Helper functions

// Extract parameters directly from the message
function extractDirectFromMessage(message: string): any {
    const params: any = {
        action: "",
        walletType: "",
        walletName: "",
        purpose: "",
        network: "ethereum",
        transactionParams: null
    };
    
    // Check for wallet type with more robust patterns
    const messageLower = message.toLowerCase();
    
    // Check if this is a wallet creation request
    if (messageLower.includes("create") || 
        messageLower.includes("new wallet") || 
        messageLower.includes("make a wallet") ||
        messageLower.includes("set up a wallet") ||
        messageLower.includes("account for me")) {
        params.action = "create_wallet";
    }
    
    // Check if this is a get details request
    if (messageLower.includes("details") || 
        messageLower.includes("show me") || 
        messageLower.includes("view") ||
        messageLower.includes("information about")) {
        params.action = "get_details";
    }
    
    // Check if this is a transfer funds request
    if (messageLower.includes("transfer") || 
        messageLower.includes("send") || 
        messageLower.includes("pay") ||
        messageLower.includes("transaction")) {
        params.action = "transfer_funds";
        
        // Extract recipient and amount for transfers
        const recipientMatch = message.match(/to\s+([0-9a-zA-Z]+)/i);
        const amountMatch = message.match(/(\d+(?:\.\d+)?)\s*(eth|btc|sol|matic)/i);
        
        if (recipientMatch || amountMatch) {
            params.transactionParams = {
                recipient: recipientMatch ? recipientMatch[1] : "unknown",
                amount: amountMatch ? parseFloat(amountMatch[1]) : 0
            };
        }
    }
    
    // Map of keywords to wallet types
    const walletTypeKeywords: {[key: string]: string} = {
        "checking": "checking",
        "account": "checking",
        "saving": "saving",
        "savings": "saving",
        "share": "sharing",
        "sharing": "sharing",
        "shared": "sharing",
        "purpose": "specific_purpose",
        "specific": "specific_purpose",
        "goal": "specific_purpose",
        "travel": "specific_purpose",
        "education": "specific_purpose",
        "wedding": "specific_purpose",
        "emergency": "specific_purpose",
        "secret": "secret",
        "private": "secret"
    };
    
    // Check for wallet type keywords
    for (const [keyword, type] of Object.entries(walletTypeKeywords)) {
        if (messageLower.includes(keyword)) {
            params.walletType = type;
            break;
        }
    }
    
    // Extract wallet name
    const namePatterns = [
        /(?:called|named|name is|for|labeled)\s+['"]([^'"]+)['"]/i,
        /(?:called|named|name is|for|labeled)\s+([A-Za-z0-9_\s]+?)(?:\s+with|\s+and|\s+using|$)/i,
        /create\s+a\s+[^"]*?wallet\s+(?:called|named)\s+['"]?([^'"]+?)['"]?(?:\s|$)/i
    ];
    
    for (const pattern of namePatterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
            params.walletName = match[1].trim();
            break;
        }
    }
    
    // Extract purpose for specific_purpose wallets
    if (params.walletType === "specific_purpose") {
        // Look for purpose patterns
        const purposePatterns = [
            /(?:for|to|purpose(?:\s+is)?|goal(?:\s+is)?)\s+['"]([^'"]+)['"]/i,
            /(?:for|to|purpose(?:\s+is)?|goal(?:\s+is)?)\s+([A-Za-z0-9_\s]+?)(?:\s+with|\s+and|\s+using|$)/i,
            /(?:saving|save|budget|fund)(?:\s+for)?\s+['"]?([^'"]+?)['"]?(?:\s|$)/i
        ];
        
        for (const pattern of purposePatterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                params.purpose = match[1].trim();
                break;
            }
        }
        
        // If no purpose found, extract common purposes from the message
        if (!params.purpose) {
            const commonPurposes = [
                "travel", "vacation", "trip", 
                "education", "school", "college",
                "wedding", "marriage", 
                "emergency", "rainy day",
                "retirement", 
                "house", "home", "car"
            ];
            
            for (const purpose of commonPurposes) {
                if (messageLower.includes(purpose)) {
                    params.purpose = purpose;
                    break;
                }
            }
        }
    }
    
    return params;
}

function createWallet(params: any): any {
    // Generate unique wallet ID
    const walletId = `wallet-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    
    // Base wallet object
    const wallet = {
        id: walletId,
        type: params.walletType,
        name: params.walletName,
        network: params.network || "ethereum",
        balance: 0,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        status: "active"
    };
    
    // Add type-specific features
    switch (params.walletType) {
        case "checking":
            return {
                ...wallet,
                features: {
                    quickAccess: true,
                    recurringPayments: true,
                    spendingAnalytics: true
                }
            };
            
        case "saving":
            return {
                ...wallet,
                features: {
                    autoInvest: true,
                    goalTracking: true,
                    marketInsights: true
                }
            };
            
        case "sharing":
            return {
                ...wallet,
                features: {
                    multiSig: true,
                    expenseTracking: true,
                    disputeResolution: true
                },
                participants: []
            };
            
        case "specific_purpose":
            return {
                ...wallet,
                features: {
                    timeLock: true,
                    goalTracking: true,
                    restrictedUse: true
                },
                purpose: params.purpose || "Specific Goal"
            };
            
        case "secret":
            return {
                ...wallet,
                features: {
                    multiSig: true,
                    coldStorage: true,
                    recoveryEnabled: true
                }
            };
            
        default:
            return wallet;
    }
}

function generateWalletDetails(wallet: any): string {
    let details = `Type: ${capitalizeFirstLetter(wallet.type)}
Name: ${wallet.name}
ID: ${wallet.id}
Network: ${wallet.network}
Balance: ${wallet.balance}
Status: ${wallet.status}
Created: ${new Date(wallet.createdAt).toLocaleString()}`;

    // Add type-specific details
    switch (wallet.type) {
        case "checking":
            details += `

Checking Account Features:
• Quick Access: ${wallet.features.quickAccess ? "Enabled" : "Disabled"}
• Recurring Payments: ${wallet.features.recurringPayments ? "Enabled" : "Disabled"}
• Spending Analytics: ${wallet.features.spendingAnalytics ? "Enabled" : "Disabled"}`;
            break;
            
        case "saving":
            details += `

Savings Account Features:
• Auto-Invest: ${wallet.features.autoInvest ? "Enabled" : "Disabled"}
• Goal Tracking: ${wallet.features.goalTracking ? "Enabled" : "Disabled"}
• Market Insights: ${wallet.features.marketInsights ? "Enabled" : "Disabled"}`;
            break;
            
        case "sharing":
            details += `

Sharing Account Features:
• Multi-Signature: ${wallet.features.multiSig ? "Enabled" : "Disabled"}
• Expense Tracking: ${wallet.features.expenseTracking ? "Enabled" : "Disabled"}
• Dispute Resolution: ${wallet.features.disputeResolution ? "Enabled" : "Disabled"}`;
            break;
            
        case "specific_purpose":
            details += `

Purpose Account Features:
• Time Lock: ${wallet.features.timeLock ? "Enabled" : "Disabled"}
• Goal Tracking: ${wallet.features.goalTracking ? "Enabled" : "Disabled"}
• Restricted Use: ${wallet.features.restrictedUse ? "Enabled" : "Disabled"}

Purpose: ${wallet.purpose}`;
            break;
            
        case "secret":
            details += `

Secret Account Features:
• Multi-Signature: ${wallet.features.multiSig ? "Enabled" : "Disabled"}
• Cold Storage: ${wallet.features.coldStorage ? "Enabled" : "Disabled"}
• Recovery: ${wallet.features.recoveryEnabled ? "Enabled" : "Disabled"}`;
            break;
    }
    
    return details;
}

function capitalizeFirstLetter(string: string): string {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// Helper function to parse model response
function parseModelResponse(response: string): any {
    const params: any = {
        walletType: "",
        walletName: "",
        purpose: "",
        network: "ethereum"
    };
    
    // Extract wallet type
    const typeMatch = response.match(/Type:\s*(\w+)/i);
    if (typeMatch && typeMatch[1]) {
        params.walletType = typeMatch[1].toLowerCase();
    }
    
    // Extract wallet name
    const nameMatch = response.match(/Name:\s*([^,]+)/i);
    if (nameMatch && nameMatch[1]) {
        params.walletName = nameMatch[1].trim();
    }
    
    // Extract purpose
    const purposeMatch = response.match(/Purpose:\s*([^,]+)/i);
    if (purposeMatch && purposeMatch[1]) {
        params.purpose = purposeMatch[1].trim();
    }
    
    // Extract network
    const networkMatch = response.match(/Network:\s*(\w+)/i);
    if (networkMatch && networkMatch[1]) {
        params.network = networkMatch[1].toLowerCase();
    }
    
    return params;
}
