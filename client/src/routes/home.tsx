import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { useWalletTransactions } from "@/components/WalletTransactions";
import Chat from "@/components/chat";
import { useState } from "react";

interface Transaction {
    hash: string;
    value: string;
    from: string;
    to: string;
    direction: "sent" | "received";
    blockNum: string;
}

export default function Home() {
    const [activeView, setActiveView] = useState<"transactions" | "assets">("transactions");
    const agentsQuery = useQuery({
        queryKey: ["agents"],
        queryFn: () => apiClient.getAgents(),
        refetchInterval: 5_000,
    });

    const transactionsQuery = useWalletTransactions();
    const firstAgent = agentsQuery?.data?.agents?.[0];

    // Query for ETH balance
    const balanceQuery = useQuery({
        queryKey: ["walletBalance"],
        queryFn: async (): Promise<string> => {
            const rpcUrl = import.meta.env.VITE_API_KEY;
            const walletAddress = import.meta.env.VITE_WALLET_ADDRESS;
            const url = `https://base-sepolia.g.alchemy.com/v2/${rpcUrl}`;
            if (!rpcUrl || !walletAddress) throw new Error("Missing VITE_API_KEY or VITE_WALLET_ADDRESS");
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "eth_getBalance",
                    params: [walletAddress, "latest"],
                    id: 1,
                }),
            });
            const data = await response.json();
            if (data.error) throw new Error(`RPC Error: ${data.error.message}`);
            const balanceInWei = parseInt(data.result, 16);
            return (balanceInWei / 1e18).toFixed(3);
        },
        staleTime: 60_000,
        retry: 2,
    });

    // Query for ETH price
    const priceQuery = useQuery({
        queryKey: ["ethPrice"],
        queryFn: async (): Promise<number> => {
            const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
            const data = await response.json();
            return data.ethereum.usd;
        },
        staleTime: 60_000,
        retry: 2,
    });

    const ethBalance = balanceQuery.isSuccess ? parseFloat(balanceQuery.data) : 0;
    const ethPrice = priceQuery.isSuccess ? priceQuery.data : 0;
    const usdValue = ethBalance * ethPrice;

    return (
        <div className="min-h-screen w-full p-6 bg-gray-50">
            <div className="flex gap-6 h-[calc(100vh-48px)] max-w-7xl mx-auto">
                {/* Left Side Container */}
                <div className="w-1/3 flex flex-col gap-6">
                    {/* Wallet Balance Section */}
                    <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
                        <h2 className="text-xl font-semibold text-gray-900 bg-gradient-to-r from-indigo-500 to-blue-500 bg-clip-text text-transparent mb-4">Wallet Balance</h2>
                        {balanceQuery.isLoading || priceQuery.isLoading ? (
                            <p className="text-gray-500 text-sm animate-pulse">Loading balance...</p>
                        ) : balanceQuery.isError || priceQuery.isError ? (
                            <p className="text-red-500 text-sm">Error loading balance</p>
                        ) : (
                            <div className="text-center">
                                <p className="text-4xl font-bold text-gray-900">${usdValue.toFixed(2)}</p>
                                <p className="text-sm text-gray-500 mt-1">{ethBalance.toFixed(3)} ETH</p>
                            </div>
                        )}
                    </div>

                    {/* Transactions / Assets Section */}
                    <div className="flex-1 bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col overflow-hidden">
                        <div className="flex gap-3 mb-4">
                            <Button
                                variant={activeView === "transactions" ? "default" : "outline"}
                                onClick={() => setActiveView("transactions")}
                                className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all duration-300 bg-gradient-to-r ${
                                    activeView === "transactions"
                                        ? "from-gray-200 to-gray-300 text-gray-700 shadow-md active:from-gray-300 active:to-gray-400"
                                        : "from-gray-100 to-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100 hover:text-gray-700"
                                }`}
                            >
                                Transactions
                            </Button>
                            <Button
                                variant={activeView === "assets" ? "default" : "outline"}
                                onClick={() => setActiveView("assets")}
                                className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all duration-300 bg-gradient-to-r ${
                                    activeView === "assets"
                                        ? "from-gray-200 to-gray-300 text-gray-700 shadow-md active:from-gray-300 active:to-gray-400"
                                        : "from-gray-100 to-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100 hover:text-gray-700"
                                }`}
                            >
                                Assets
                            </Button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {activeView === "transactions" ? (
                                transactionsQuery.isLoading ? (
                                    <div className="flex justify-center items-center h-full w-full">
                                        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500" />
                                    </div>
                                ) : transactionsQuery.isError ? (
                                    <p className="text-red-500 text-sm">Error: {transactionsQuery.error?.message}</p>
                                ) : transactionsQuery.data?.length === 0 ? (
                                    <p className="text-gray-500 text-sm">No transactions found.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {transactionsQuery.data!.map((tx: Transaction) => {
                                            const value = tx.value;
                                            const direction = tx.direction === "sent" ? "Sent" : "Received";
                                            return (
                                                <div
                                                    key={tx.hash}
                                                    className="p-4 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-all duration-300"
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-gray-900 font-medium capitalize text-sm">{direction}</span>
                                                        <span className="text-indigo-500 font-semibold text-sm">{value} ETH</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )
                            ) : (
                                <div className="text-sm text-gray-500">Assets view coming soon...</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Container - Chat Interface */}
                <div className="w-2/3 bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col overflow-hidden">
                    <h2 className="text-xl font-semibold text-gray-900 bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent mb-4">Chat</h2>
                    <div className="flex-1 overflow-y-auto">
                        {firstAgent ? (
                            <Chat agentId={firstAgent.id} />
                        ) : (
                            <p className="text-gray-500 text-sm animate-pulse">Loading chat...</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}