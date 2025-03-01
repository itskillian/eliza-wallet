import { useQuery } from "@tanstack/react-query";

// Function to fetch wallet balance from Base Sepolia
const fetchWalletBalance = async (): Promise<string> => {
    const rpcUrl = import.meta.env.VITE_API_KEY;
    const walletAddress = import.meta.env.VITE_WALLET_ADDRESS;
    const url = `https://base-sepolia.g.alchemy.com/v2/${rpcUrl}`;

    if (!rpcUrl || !walletAddress) {
        throw new Error("Missing VITE_API_KEY or VITE_WALLET_ADDRESS in environment variables");
    }

    const requestBody = {
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [walletAddress, "latest"],
        id: 1,
    };

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(`RPC Error: ${data.error.message}`);
    }

    const balanceInHex = data.result;
    const balanceInWei = parseInt(balanceInHex, 16);
    const balanceInEther = balanceInWei / 1e18;
    return balanceInEther.toFixed(3);
};

export function WalletBalance() {
    const balanceQuery = useQuery({
        queryKey: ["walletBalance"],
        queryFn: fetchWalletBalance,
        staleTime: 60_000, // Refetch every minute
        retry: 2, // Retry on failure up to 2 times
    });

    if (balanceQuery.isLoading) {
        return <p>Loading balance...</p>;
    }

    if (balanceQuery.isError) {
        return (
            <p className="text-red-500">Error fetching balance: {balanceQuery.error?.message}</p>
        );
    }

    return (
        <p className="text-xl font-bold">
            {balanceQuery.data} ETH{" "}
            <span className="text-sm font-normal text-muted-foreground">
                (Base Sepolia)
            </span>
        </p>
    );
}