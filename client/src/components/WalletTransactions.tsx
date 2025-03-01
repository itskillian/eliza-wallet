import { useQuery } from "@tanstack/react-query";

// Function to fetch wallet transactions from Base Sepolia
const fetchWalletTransactions = async () => {
    const rpcUrl = import.meta.env.VITE_API_KEY;
    const walletAddress = import.meta.env.VITE_WALLET_ADDRESS;
    const url = `https://base-sepolia.g.alchemy.com/v2/${rpcUrl}`;

    if (!rpcUrl || !walletAddress) {
        throw new Error("Missing VITE_API_KEY or VITE_WALLET_ADDRESS in environment variables");
    }

    const requestBodyBase = {
        jsonrpc: "2.0",
        method: "alchemy_getAssetTransfers",
        params: [{
            fromBlock: "0x0",
            toBlock: "latest",
            category: ["external"], // Base Sepolia ETH transfers
            maxCount: "0x3e8",
            excludeZeroValue: false,
            fromAddress: undefined as string | undefined,
            toAddress: undefined as string | undefined
        }],
        id: 1
    };

    try {
        // Fetch sent transactions
        const sentRequestBody = { ...requestBodyBase };
        sentRequestBody.params[0].fromAddress = walletAddress;
        sentRequestBody.params[0].toAddress = undefined;

        const sentResponse = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sentRequestBody)
        });
        const sentData = await sentResponse.json();

        // Fetch received transactions
        const receivedRequestBody = { ...requestBodyBase };
        receivedRequestBody.params[0].fromAddress = undefined;
        receivedRequestBody.params[0].toAddress = walletAddress;

        const receivedResponse = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(receivedRequestBody)
        });
        const receivedData = await receivedResponse.json();

        // Check for RPC errors
        if (sentData.error) throw new Error(`Sent RPC Error: ${sentData.error.message}`);
        if (receivedData.error) throw new Error(`Received RPC Error: ${receivedData.error.message}`);

        // Combine sent and received transactions
        const sentTransfers = sentData.result?.transfers || [];
        const receivedTransfers = receivedData.result?.transfers || [];

        // Add a direction property to differentiate sent/received for easier rendering
        const allTransactions = [
            ...sentTransfers.map((tx: any) => ({ ...tx, direction: "sent" })),
            ...receivedTransfers.map((tx: any) => ({ ...tx, direction: "received" }))
        ];

        console.log(`Found ${sentTransfers.length} sent transactions and ${receivedTransfers.length} received transactions.`);
        console.log("All Transactions:", allTransactions);

        return allTransactions; // Return combined array with direction
    } catch (error) {
        console.error("Error fetching transactions:", error instanceof Error ? error.message : String(error));
        throw error;
    }
};

export function useWalletTransactions() {
    return useQuery({
        queryKey: ["walletTransactions"],
        queryFn: fetchWalletTransactions,
        staleTime: 60_000, // Refetch every minute
        retry: 2, // Retry on failure up to 2 times
    });
}