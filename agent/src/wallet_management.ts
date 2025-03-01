import { Action, ActionExample, Content, generateText, HandlerCallback, IAgentRuntime, Memory, ModelClass, State } from "@elizaos/core";
import { z } from "zod";

// Define input schema for wallet management action
const WalletManagementInput = z.object({
    action: z.enum([
        "create_wallet",
        "get_details",
        "get_cost_summary",
        "transfer_funds",
        "manage_permissions",
        "get_ai_advice"
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
    
    // Sharing Parameters
    sharingParams: z.object({
        participants: z.array(
            z.object({
                address: z.string(),
                permissionLevel: z.enum(["view", "spend", "admin"]),
                spendingLimit: z.number().optional()
            })
        ),
        notificationPreferences: z.object({
            transactionThreshold: z.number().optional(),
            requireApproval: z.boolean().optional(),
            notifyAllTransactions: z.boolean().optional()
        }).optional()
    }).optional(),
    
    // Transaction Parameters
    transactionParams: z.object({
        recipient: z.string(),
        amount: z.number(),
        memo: z.string().optional(),
        category: z.string().optional()
    }).optional(),
    
    // AI Advice Parameters
    adviceParams: z.object({
        topic: z.enum(["spending", "saving", "investment", "budget"]),
        timeframe: z.enum(["weekly", "monthly", "quarterly", "yearly"]).optional()
    }).optional()
}).strip().describe("Instructions for wallet management operations");

// Wallet management action
export const walletManagement: Action = {
    name: "WALLET_MANAGEMENT", 
    similes: ["create wallet", "new wallet", "wallet management", "manage wallet", "wallet details"],
    description: "Create and manage different types of wallets",
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
            
            // Check if request is from GM wallet character
            const isGmWallet = message.agentId && message.agentId.toLowerCase().includes('gm');
            
            // Extract parameters from message content
            const params = await extractParams(runtime, message.content.text || "");
            console.log("Extracted parameters:", params);
            
            // Add debug information to show what's being parsed
            const debugInfo = `
DEBUG INFO:
- Original message: "${message.content.text}"
- Is GM wallet: ${isGmWallet}
- Parsed action: "${params.action}"
- Wallet type: "${params.walletType}"
- Wallet name: "${params.walletName}"
- Other params: ${JSON.stringify(params)}
`;
            console.log(debugInfo);
            
            // Force create_wallet action for messages containing wallet creation keywords
            if (message.content.text && 
                (message.content.text.toLowerCase().includes("create") || 
                 message.content.text.toLowerCase().includes("new wallet") || 
                 message.content.text.toLowerCase().includes("make a wallet") ||
                 message.content.text.toLowerCase().includes("set up a wallet") ||
                 message.content.text.toLowerCase().includes("account"))) {
                
                params.action = "create_wallet";
                
                // If wallet type is not specified but "checking" or "account" is mentioned, set it to checking
                if (!params.walletType && 
                    (message.content.text.toLowerCase().includes("checking") || 
                     message.content.text.toLowerCase().includes("account"))) {
                    params.walletType = "checking";
                }
                
                // If wallet name is not specified, generate a default name
                if (!params.walletName) {
                    params.walletName = params.walletType ? 
                        `My ${capitalizeFirstLetter(params.walletType)} Wallet` : 
                        "My New Wallet";
                }
            }
            
            // For GM wallet, provide enhanced response only for general inquiries
            if (isGmWallet && !params.action) {
                const responseText = "I manage your wallets and their transactions. You can create new wallets, organize and categorize your transactions. Would you like to view your wallet details, create a new wallet, or perform a transaction?";
                
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
                    
                    // Create wallet
                    const wallet = createWallet(params);
                    const walletDetails = generateWalletDetails(wallet);
                    
                    // Get initial AI insights
                    const aiAdvice = await getAIAdvice(runtime, wallet, {
                        adviceParams: {
                            topic: "spending",
                            timeframe: "monthly"
                        }
                    });
                    
                    // Format response
                    const responseText = `✅ Wallet Created Successfully!

📋 WALLET DETAILS:
${walletDetails}

🤖 AI INSIGHTS:
${aiAdvice.summary}

Recommendations:
${aiAdvice.recommendations.map(r => `• ${r}`).join("\n")}

${isGmWallet ? `I've added this ${params.walletType} wallet "${params.walletName}" to your collection. You can now manage it alongside your other wallets.` : `Your new ${params.walletType} wallet "${params.walletName}" is ready to use.`}`;

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
${details}${isGmWallet ? "\n\nI'm managing this wallet for you. Would you like to make any changes or perform a transaction?" : ""}`;
                    
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
                
                case "get_ai_advice": {
                    if (!params.adviceParams) {
                        const promptMessage: Memory = {
                            userId: message.userId,
                            agentId: message.agentId,
                            roomId: message.roomId,
                            content: {
                                text: "Please specify what type of advice you need (spending, saving, investment, or budget) and optionally the timeframe (weekly, monthly, quarterly, yearly).",
                                action: "WALLET_MANAGEMENT",
                                source: message.content.source,
                            } as Content,
                        };
                        
                        await runtime.messageManager.createMemory(promptMessage);
                        callback(promptMessage.content);
                        return true;
                    }
                    
                    // In a real implementation, this would fetch the actual wallet
                    const wallet = createWallet(params); // Simulated for MVP
                    const advice = await getAIAdvice(runtime, wallet, params);
                    
                    const responseText = `🤖 AI WALLET INSIGHTS

${advice.summary}

Recommendations:
${advice.recommendations.map(r => `• ${r}`).join("\n")}

Detailed Insights:
${advice.insights.map(i => `• ${i}`).join("\n")}`;
                    
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
${params.transactionParams.category ? `• Category: ${params.transactionParams.category}` : ""}

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
                
                case "manage_permissions": {
                    if (!params.sharingParams) {
                        const promptMessage: Memory = {
                            userId: message.userId,
                            agentId: message.agentId,
                            roomId: message.roomId,
                            content: {
                                text: "Please specify the participants and their permission levels (view, spend, admin).",
                                action: "WALLET_MANAGEMENT",
                                source: message.content.source,
                            } as Content,
                        };
                        
                        await runtime.messageManager.createMemory(promptMessage);
                        callback(promptMessage.content);
                        return true;
                    }
                    
                    // In a real implementation, this would update permissions in storage
                    const responseText = `Permissions updated:
${params.sharingParams.participants.map(p => 
    `• ${p.address}: ${p.permissionLevel}${p.spendingLimit ? ` (Limit: ${p.spendingLimit})` : ""}`
).join("\n")}

Notification preferences:
${params.sharingParams.notificationPreferences ? `
• Transaction threshold: ${params.sharingParams.notificationPreferences.transactionThreshold || "None"}
• Require approval: ${params.sharingParams.notificationPreferences.requireApproval ? "Yes" : "No"}
• Notify all transactions: ${params.sharingParams.notificationPreferences.notifyAllTransactions ? "Yes" : "No"}` : "Default settings applied"}`;
                    
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
                            text: "Please specify a valid action: create_wallet, get_details, get_cost_summary, transfer_funds, manage_permissions, or get_ai_advice",
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
                    text: "Can I create a sharing wallet for my family expenses?" 
                }
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you create a sharing wallet for your family expenses. Please specify who you'd like to share this wallet with and what permissions they should have.",
                    action: "WALLET_MANAGEMENT"
                }
            }
        ]
    ] as ActionExample[][],
} as Action;

// Helper functions

function extractWalletParams(modelResponse: string, originalMessage: string): any {
    // Default values
    const params = {
        Wallet_Type: "",
        Wallet_Name: "",
        Initial_Deposit: 0,
        Currency: "USD",
        Permissions: [] as string[]
    };
    
    // Try to parse structured format first (from model response)
    const typeMatch = modelResponse.match(/Type:\s*(\w+)/i);
    if (typeMatch && typeMatch[1]) {
        const type = typeMatch[1].toLowerCase();
        if (["checking", "saving", "sharing", "specific_purpose", "secret"].includes(type)) {
            params.Wallet_Type = type;
        }
    }
    
    const nameMatch = modelResponse.match(/Name:\s*([^,]+)/i);
    if (nameMatch && nameMatch[1]) {
        params.Wallet_Name = nameMatch[1].trim();
    }
    
    const depositMatch = modelResponse.match(/Deposit:\s*(\d+(\.\d+)?)/i);
    if (depositMatch && depositMatch[1]) {
        params.Initial_Deposit = parseFloat(depositMatch[1]);
    }
    
    const currencyMatch = modelResponse.match(/Currency:\s*([A-Z]{3,4})/i);
    if (currencyMatch && currencyMatch[1]) {
        params.Currency = currencyMatch[1].toUpperCase();
    }
    
    // If wallet type is still empty, try to extract from original message
    if (!params.Wallet_Type) {
        const messageLower = originalMessage.toLowerCase();
        if (messageLower.includes("checking")) {
            params.Wallet_Type = "checking";
        } else if (messageLower.includes("saving")) {
            params.Wallet_Type = "saving";
        } else if (messageLower.includes("sharing") || messageLower.includes("shared")) {
            params.Wallet_Type = "sharing";
        } else if (messageLower.includes("specific") || messageLower.includes("purpose")) {
            params.Wallet_Type = "specific_purpose";
        } else if (messageLower.includes("secret")) {
            params.Wallet_Type = "secret";
        }
    }
    
    // Try to extract wallet name from original message if not found
    if (!params.Wallet_Name) {
        const nameRegex = /(?:called|named|name is|for)\s+['"]([^'"]+)['"]/i;
        const nameMatch = originalMessage.match(nameRegex);
        if (nameMatch && nameMatch[1]) {
            params.Wallet_Name = nameMatch[1].trim();
        }
    }
    
    // Extract permissions from original message for sharing wallets
    if (params.Wallet_Type === "sharing") {
        const permissionKeywords = ["share with", "permission", "access", "authorize"];
        const messageLower = originalMessage.toLowerCase();
        
        permissionKeywords.forEach(keyword => {
            if (messageLower.includes(keyword)) {
                // Simple extraction - in a real implementation, this would be more sophisticated
                const people = ["family", "spouse", "partner", "children", "parents"];
                people.forEach(person => {
                    if (messageLower.includes(person)) {
                        params.Permissions.push(person);
                    }
                });
            }
        });
    }
    
    return params;
}

async function requestPermissions(runtime: IAgentRuntime, params: any): Promise<{success: boolean, permissions: string[]}> {
    // In a real implementation, this would make a request to another agent
    // For this example, we'll simulate a successful response
    
    // Simulate communication with other agent's wallet management
    console.log("Requesting permissions from other agent's wallet management");
    
    // Return simulated response
    return {
        success: params.Permissions && params.Permissions.length > 0,
        permissions: params.Permissions || []
    };
}

function createWallet(params: any): any {
    // Set default network if not specified
    const network = params.network || "ethereum";
    
    // Generate unique wallet ID
    const walletId = `wallet-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    
    // Base wallet object
    const wallet = {
        id: walletId,
        type: params.walletType,
        name: params.walletName,
        network,
        balance: 0,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        status: "active",
        features: {
            aiEnabled: true,
            notifications: true,
            autoInvest: false
        }
    };
    
    // Add type-specific features
    switch (params.walletType) {
        case "checking":
            return {
                ...wallet,
                features: {
                    ...wallet.features,
                    quickAccess: true,
                    recurringPayments: true,
                    spendingAnalytics: true
                },
                limits: {
                    dailySpending: 1000,
                    perTransaction: 500
                },
                analytics: {
                    categories: [],
                    monthlySpending: 0,
                    lastAnalysis: new Date().toISOString()
                }
            };
            
        case "saving":
            return {
                ...wallet,
                features: {
                    ...wallet.features,
                    autoInvest: true,
                    goalTracking: true,
                    marketInsights: true
                },
                savingsGoal: {
                    target: 0,
                    deadline: null,
                    progress: 0
                },
                strategy: {
                    riskLevel: "moderate",
                    dcaEnabled: false,
                    dcaAmount: 0,
                    dcaFrequency: "monthly"
                }
            };
            
        case "sharing":
            return {
                ...wallet,
                features: {
                    ...wallet.features,
                    multiSig: true,
                    expenseTracking: true,
                    disputeResolution: true
                },
                participants: params.sharingParams?.participants || [],
                notificationPreferences: params.sharingParams?.notificationPreferences || {
                    transactionThreshold: 100,
                    requireApproval: true,
                    notifyAllTransactions: true
                },
                analytics: {
                    contributions: {},
                    expenses: {},
                    lastSync: new Date().toISOString()
                }
            };
            
        case "specific_purpose":
            return {
                ...wallet,
                features: {
                    ...wallet.features,
                    timeLock: true,
                    goalTracking: true,
                    restrictedUse: true
                },
                purpose: params.purpose,
                timeline: {
                    startDate: new Date().toISOString(),
                    targetDate: null,
                    milestones: []
                },
                restrictions: {
                    allowedCategories: [],
                    spendingLimit: 0,
                    withdrawalRules: []
                }
            };
            
        case "secret":
            return {
                ...wallet,
                features: {
                    ...wallet.features,
                    multiSig: true,
                    coldStorage: true,
                    recoveryEnabled: true
                },
                security: {
                    accessLevel: "high",
                    timelock: true,
                    timelockDuration: 24 * 60 * 60, // 24 hours in seconds
                    recoveryContacts: [],
                    lastAccess: new Date().toISOString()
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
Created: ${new Date(wallet.createdAt).toLocaleString()}
Last Updated: ${new Date(wallet.lastUpdated).toLocaleString()}

Features:`;

    // Add base features
    details += `
• AI Integration: ${wallet.features.aiEnabled ? "Enabled" : "Disabled"}
• Notifications: ${wallet.features.notifications ? "Enabled" : "Disabled"}
• Auto-Invest: ${wallet.features.autoInvest ? "Enabled" : "Disabled"}`;

    // Add type-specific features
    switch (wallet.type) {
        case "checking":
            details += `

Checking Account Features:
• Quick Access: ${wallet.features.quickAccess ? "Enabled" : "Disabled"}
• Recurring Payments: ${wallet.features.recurringPayments ? "Enabled" : "Disabled"}
• Spending Analytics: ${wallet.features.spendingAnalytics ? "Enabled" : "Disabled"}

Limits:
• Daily Spending: ${wallet.limits.dailySpending}
• Per Transaction: ${wallet.limits.perTransaction}

Analytics:
• Monthly Spending: ${wallet.analytics.monthlySpending}
• Last Analysis: ${new Date(wallet.analytics.lastAnalysis).toLocaleString()}`;
            break;
            
        case "saving":
            details += `

Savings Account Features:
• Goal Tracking: ${wallet.features.goalTracking ? "Enabled" : "Disabled"}
• Market Insights: ${wallet.features.marketInsights ? "Enabled" : "Disabled"}

Savings Goal:
• Target: ${wallet.savingsGoal.target}
• Progress: ${wallet.savingsGoal.progress}
${wallet.savingsGoal.deadline ? `• Deadline: ${new Date(wallet.savingsGoal.deadline).toLocaleString()}` : ""}

Investment Strategy:
• Risk Level: ${wallet.strategy.riskLevel}
• DCA Enabled: ${wallet.strategy.dcaEnabled ? "Yes" : "No"}
${wallet.strategy.dcaEnabled ? `• DCA Amount: ${wallet.strategy.dcaAmount}
• DCA Frequency: ${wallet.strategy.dcaFrequency}` : ""}`;
            break;
            
        case "sharing":
            details += `

Sharing Account Features:
• Multi-Signature: ${wallet.features.multiSig ? "Enabled" : "Disabled"}
• Expense Tracking: ${wallet.features.expenseTracking ? "Enabled" : "Disabled"}
• Dispute Resolution: ${wallet.features.disputeResolution ? "Enabled" : "Disabled"}

Participants:
${wallet.participants.map((p: any) => 
    `• ${p.address}: ${p.permissionLevel}${p.spendingLimit ? ` (Limit: ${p.spendingLimit})` : ""}`
).join("\n")}

Notification Preferences:
• Transaction Threshold: ${wallet.notificationPreferences.transactionThreshold || "None"}
• Require Approval: ${wallet.notificationPreferences.requireApproval ? "Yes" : "No"}
• Notify All Transactions: ${wallet.notificationPreferences.notifyAllTransactions ? "Yes" : "No"}`;
            break;
            
        case "specific_purpose":
            details += `

Purpose Account Features:
• Time Lock: ${wallet.features.timeLock ? "Enabled" : "Disabled"}
• Goal Tracking: ${wallet.features.goalTracking ? "Enabled" : "Disabled"}
• Restricted Use: ${wallet.features.restrictedUse ? "Enabled" : "Disabled"}

Purpose: ${wallet.purpose}

Timeline:
• Start Date: ${new Date(wallet.timeline.startDate).toLocaleString()}
${wallet.timeline.targetDate ? `• Target Date: ${new Date(wallet.timeline.targetDate).toLocaleString()}` : ""}

Restrictions:
• Allowed Categories: ${wallet.restrictions.allowedCategories.length > 0 ? wallet.restrictions.allowedCategories.join(", ") : "None"}
• Spending Limit: ${wallet.restrictions.spendingLimit}`;
            break;
            
        case "secret":
            details += `

Secret Account Features:
• Multi-Signature: ${wallet.features.multiSig ? "Enabled" : "Disabled"}
• Cold Storage: ${wallet.features.coldStorage ? "Enabled" : "Disabled"}
• Recovery: ${wallet.features.recoveryEnabled ? "Enabled" : "Disabled"}

Security:
• Access Level: ${wallet.security.accessLevel}
• Time Lock: ${wallet.security.timelock ? "Enabled" : "Disabled"}
• Time Lock Duration: ${wallet.security.timelockDuration / 3600} hours
• Last Access: ${new Date(wallet.security.lastAccess).toLocaleString()}
• Recovery Contacts: ${wallet.security.recoveryContacts.length}`;
            break;
    }
    
    return details;
}

function generateCostSummary(wallet: any): string {
    let summary = `Creation Fee: $${wallet.fees.creation.toFixed(2)}
Monthly Fee: $${wallet.fees.monthly.toFixed(2)}
Transaction Fee: $${wallet.fees.transaction.toFixed(2)} per transaction`;

    // Add gas fee information for crypto wallets
    if (isCryptoCurrency(wallet.currency) && wallet.fees.gas > 0) {
        summary += `\nEstimated Gas Fee: ${wallet.fees.gas} ${getGasCurrency(wallet.network)} per transaction`;
    }
    
    return summary;
}

function capitalizeFirstLetter(string: string): string {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// Add a new function for direct extraction from the message
function extractDirectFromMessage(message: string): any {
    const params = {
        action: "", // Add action field
        walletType: "", // Use camelCase to match the schema
        walletName: "", // Use camelCase to match the schema
        Initial_Deposit: 0,
        Currency: "ETH", // Default to ETH for crypto wallets
        Network: "Ethereum", // Default to Ethereum network
        Permissions: [] as string[]
    };
    
    console.log("Extracting directly from message:", message);
    
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
    
    // Map of keywords to wallet types
    const walletTypeKeywords: {[key: string]: string} = {
        "checking": "checking",
        "check": "checking",
        "current": "checking",
        "everyday": "checking",
        "daily": "checking",
        "account": "checking", // Treat generic "account" as checking
        "saving": "saving",
        "savings": "saving",
        "save": "saving",
        "share": "sharing",
        "sharing": "sharing",
        "shared": "sharing",
        "family": "sharing",
        "joint": "sharing",
        "purpose": "specific_purpose",
        "specific": "specific_purpose",
        "special": "specific_purpose",
        "dedicated": "specific_purpose",
        "secret": "secret",
        "private": "secret",
        "hidden": "secret",
        "crypto": "checking", // Default crypto wallets to checking type
        "cryptocurrency": "checking",
        "digital": "checking"
    };
    
    // Check for wallet type keywords
    for (const [keyword, type] of Object.entries(walletTypeKeywords)) {
        if (messageLower.includes(keyword)) {
            params.walletType = type;
            console.log(`Found wallet type '${type}' from keyword '${keyword}'`);
            break;
        }
    }
    
    // Extract wallet name
    // Look for patterns like "called X", "named X", "with name X", etc.
    const namePatterns = [
        /(?:called|named|name is|for|labeled)\s+['"]([^'"]+)['"]/i,
        /(?:called|named|name is|for|labeled)\s+([A-Za-z0-9_\s]+?)(?:\s+with|\s+and|\s+using|$)/i,
        /create\s+a\s+[^"]*?wallet\s+(?:called|named)\s+['"]?([^'"]+?)['"]?(?:\s|$)/i
    ];
    
    for (const pattern of namePatterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
            params.walletName = match[1].trim();
            console.log(`Found wallet name: ${params.walletName}`);
            break;
        }
    }
    
    // If no name found but we have a type, generate a default name
    if (!params.walletName && params.walletType) {
        params.walletName = `My ${capitalizeFirstLetter(params.walletType)} Wallet`;
        console.log(`Generated default wallet name: ${params.walletName}`);
    }
    
    // Extract initial deposit amount
    const depositPatterns = [
        /(?:deposit|with|initial balance of|starting with|amount of)\s+(\d+(?:\.\d+)?)\s*(?:dollars|usd|eur|btc|eth|$)/i,
        /(\d+(?:\.\d+)?)\s*(?:dollars|usd|eur|btc|eth)/i
    ];
    
    for (const pattern of depositPatterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
            params.Initial_Deposit = parseFloat(match[1]);
            console.log(`Found initial deposit: ${params.Initial_Deposit}`);
            break;
        }
    }
    
    // Extract currency
    const currencyPatterns = [
        /(?:in|using|with)\s+(usd|eur|gbp|jpy|cny|btc|eth|ltc|xrp)/i,
        /(?:dollars|euros|pounds|yen|yuan|bitcoin|ethereum|litecoin|ripple)/i
    ];
    
    const currencyMap: {[key: string]: string} = {
        'dollars': 'USD',
        'usd': 'USD',
        'euros': 'EUR',
        'eur': 'EUR',
        'pounds': 'GBP',
        'gbp': 'GBP',
        'yen': 'JPY',
        'jpy': 'JPY',
        'yuan': 'CNY',
        'cny': 'CNY',
        'bitcoin': 'BTC',
        'btc': 'BTC',
        'ethereum': 'ETH',
        'eth': 'ETH',
        'litecoin': 'LTC',
        'ltc': 'LTC',
        'ripple': 'XRP',
        'xrp': 'XRP'
    };
    
    for (const pattern of currencyPatterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
            const currencyKey = match[1].toLowerCase();
            if (currencyMap[currencyKey]) {
                params.Currency = currencyMap[currencyKey];
                console.log(`Found currency: ${params.Currency}`);
                break;
            }
        }
    }
    
    // Extract network information for crypto wallets
    const networkKeywords: {[key: string]: string} = {
        "ethereum": "Ethereum",
        "eth": "Ethereum",
        "erc20": "Ethereum",
        "bitcoin": "Bitcoin",
        "btc": "Bitcoin",
        "solana": "Solana",
        "sol": "Solana",
        "polygon": "Polygon",
        "matic": "Polygon",
        "avalanche": "Avalanche",
        "avax": "Avalanche",
        "binance": "Binance Smart Chain",
        "bsc": "Binance Smart Chain",
        "cardano": "Cardano",
        "ada": "Cardano",
        "polkadot": "Polkadot",
        "dot": "Polkadot"
    };
    
    for (const [keyword, network] of Object.entries(networkKeywords)) {
        if (messageLower.includes(keyword)) {
            params.Network = network;
            console.log(`Found network: ${network}`);
            
            // Also update default currency based on network
            const networkCurrencies: {[key: string]: string} = {
                "Ethereum": "ETH",
                "Bitcoin": "BTC",
                "Solana": "SOL",
                "Polygon": "MATIC",
                "Avalanche": "AVAX",
                "Binance Smart Chain": "BNB",
                "Cardano": "ADA",
                "Polkadot": "DOT"
            };
            
            if (networkCurrencies[network]) {
                params.Currency = networkCurrencies[network];
                console.log(`Updated currency to ${params.Currency} based on network`);
            }
            
            break;
        }
    }
    
    // Extract permissions for sharing wallets
    if (params.walletType === "sharing") {
        const permissionKeywords = ["share with", "permission", "access", "authorize"];
        
        permissionKeywords.forEach(keyword => {
            if (messageLower.includes(keyword)) {
                // Simple extraction - in a real implementation, this would be more sophisticated
                const people = ["family", "spouse", "partner", "children", "parents", "friends"];
                people.forEach(person => {
                    if (messageLower.includes(person)) {
                        params.Permissions.push(person);
                        console.log(`Found permission for: ${person}`);
                    }
                });
            }
        });
    }
    
    console.log("Direct extraction complete:", params);
    return params;
}

// Helper functions for crypto wallet handling

function isCryptoCurrency(currency: string): boolean {
    const cryptoCurrencies = ["BTC", "ETH", "SOL", "MATIC", "AVAX", "BNB", "ADA", "DOT", "XRP", "LTC"];
    return cryptoCurrencies.includes(currency);
}

function getDefaultNetworkForCurrency(currency: string): string {
    const currencyNetworkMap: {[key: string]: string} = {
        "BTC": "Bitcoin",
        "ETH": "Ethereum",
        "SOL": "Solana",
        "MATIC": "Polygon",
        "AVAX": "Avalanche",
        "BNB": "Binance Smart Chain",
        "ADA": "Cardano",
        "DOT": "Polkadot",
        "XRP": "Ripple",
        "LTC": "Litecoin"
    };
    
    return currencyNetworkMap[currency] || "Ethereum";
}

function getEstimatedGasFee(network: string): number {
    const networkGasFees: {[key: string]: number} = {
        "Ethereum": 0.005,
        "Bitcoin": 0.0001,
        "Solana": 0.00001,
        "Polygon": 0.0001,
        "Avalanche": 0.0005,
        "Binance Smart Chain": 0.0003,
        "Cardano": 0.2,
        "Polkadot": 0.1
    };
    
    return networkGasFees[network] || 0.001;
}

function getGasCurrency(network: string): string {
    const networkGasCurrencies: {[key: string]: string} = {
        "Ethereum": "ETH",
        "Bitcoin": "BTC",
        "Solana": "SOL",
        "Polygon": "MATIC",
        "Avalanche": "AVAX",
        "Binance Smart Chain": "BNB",
        "Cardano": "ADA",
        "Polkadot": "DOT"
    };
    
    return networkGasCurrencies[network] || network;
}

// Add AI integration functions
async function getAIAdvice(runtime: IAgentRuntime, wallet: any, params: any): Promise<any> {
    const { topic, timeframe = "monthly" } = params.adviceParams;
    
    // Generate context based on wallet type and data
    const context = {
        walletType: wallet.type,
        balance: wallet.balance,
        transactions: [], // Would be fetched from transaction history
        analytics: wallet.analytics,
        timeframe
    };
    
    // Get AI-powered insights
    const insights = await generateWalletInsights(runtime, context);
    
    return {
        summary: insights.summary,
        recommendations: insights.recommendations,
        insights: insights.details
    };
}

async function generateWalletInsights(runtime: IAgentRuntime, context: any): Promise<any> {
    // This would integrate with a more sophisticated AI model in production
    // For MVP, we'll return basic insights based on wallet type
    
    const insights = {
        summary: `Analysis of your ${context.walletType} wallet for the ${context.timeframe} period`,
        recommendations: [],
        details: []
    };
    
    switch (context.walletType) {
        case "checking":
            insights.recommendations = [
                "Set up automatic categorization for transactions",
                "Enable spending alerts for large transactions",
                "Review recurring payments for potential savings"
            ];
            break;
            
        case "saving":
            insights.recommendations = [
                "Consider enabling DCA for steady investment growth",
                "Set up a specific savings goal",
                "Review market conditions for optimal timing"
            ];
            break;
            
        case "sharing":
            insights.recommendations = [
                "Review contribution balance between participants",
                "Set up approval workflows for large expenses",
                "Enable detailed expense tracking"
            ];
            break;
            
        case "specific_purpose":
            insights.recommendations = [
                "Track progress towards your goal",
                "Review spending restrictions",
                "Set up milestone notifications"
            ];
            break;
            
        case "secret":
            insights.recommendations = [
                "Review security settings regularly",
                "Verify recovery contacts",
                "Consider cold storage options"
            ];
            break;
    }
    
    return insights;
}

// Helper function to extract parameters from message
async function extractParams(runtime: IAgentRuntime, message: string): Promise<any> {
    // First try direct extraction
    const directParams = extractDirectFromMessage(message);
    
    // If we have all required parameters, return them
    if (directParams.action && 
        ((directParams.action === "create_wallet" && directParams.walletType && directParams.walletName) ||
         directParams.action === "get_details" ||
         (directParams.action === "get_ai_advice" && directParams.adviceParams) ||
         (directParams.action === "transfer_funds" && directParams.transactionParams) ||
         (directParams.action === "manage_permissions" && directParams.sharingParams))) {
        return directParams;
    }
    
    // Otherwise, use AI to extract parameters
    const context = `
    Extract the following information from the message:
    1. Action type (create_wallet, get_details, get_ai_advice, transfer_funds, manage_permissions)
    2. Wallet type if creating (checking, saving, sharing, specific_purpose, secret)
    3. Wallet name if specified
    4. Other relevant parameters based on the action
    
    Note: If the message mentions "account" or "checking account", this should be interpreted as a request to create a checking wallet.
    
    Message: ${message}
    `;
    
    const extractedParams = await generateText({
        runtime: runtime,
        context: context,
        modelClass: ModelClass.SMALL,
        stop: ["\n"],
    });
    
    // Parse the AI response and combine with direct extraction
    const modelParams = parseAIResponse(extractedParams);
    
    // If the message contains wallet creation keywords but no action was set, default to create_wallet
    if (!directParams.action && !modelParams.action && 
        (message.toLowerCase().includes("create") || 
         message.toLowerCase().includes("new wallet") || 
         message.toLowerCase().includes("make a wallet") ||
         message.toLowerCase().includes("account"))) {
        directParams.action = "create_wallet";
    }
    
    // If action is create_wallet but no wallet type, check for account-related keywords
    if ((directParams.action === "create_wallet" || modelParams.action === "create_wallet") && 
        !directParams.walletType && !modelParams.walletType) {
        
        if (message.toLowerCase().includes("account") || 
            message.toLowerCase().includes("checking")) {
            directParams.walletType = "checking";
        }
    }
    
    // If we have a create_wallet action but no name, generate a default name
    if ((directParams.action === "create_wallet" || modelParams.action === "create_wallet") && 
        !directParams.walletName && !modelParams.walletName) {
        
        const type = directParams.walletType || modelParams.walletType || "New";
        directParams.walletName = `My ${capitalizeFirstLetter(type)} Wallet`;
    }
    
    return {
        ...directParams,
        ...modelParams
    };
}

// Helper function to parse AI response
function parseAIResponse(response: string): any {
    // Implementation would parse the AI response into structured parameters
    const params: any = {};
    
    // Check for action type
    if (response.toLowerCase().includes("create_wallet") || 
        response.toLowerCase().includes("create wallet") ||
        response.toLowerCase().includes("create account") ||
        response.toLowerCase().includes("new account")) {
        params.action = "create_wallet";
    } else if (response.toLowerCase().includes("get_details") || 
               response.toLowerCase().includes("get details")) {
        params.action = "get_details";
    } else if (response.toLowerCase().includes("get_ai_advice") || 
               response.toLowerCase().includes("get ai advice")) {
        params.action = "get_ai_advice";
    } else if (response.toLowerCase().includes("transfer_funds") || 
               response.toLowerCase().includes("transfer funds")) {
        params.action = "transfer_funds";
    } else if (response.toLowerCase().includes("manage_permissions") || 
               response.toLowerCase().includes("manage permissions")) {
        params.action = "manage_permissions";
    }
    
    // Extract wallet type if present
    const walletTypes = ["checking", "saving", "sharing", "specific_purpose", "secret"];
    for (const type of walletTypes) {
        if (response.toLowerCase().includes(type)) {
            params.walletType = type;
            break;
        }
    }
    
    // If no wallet type is found but "account" is mentioned, default to checking
    if (!params.walletType && response.toLowerCase().includes("account")) {
        params.walletType = "checking";
    }
    
    return params;
}
