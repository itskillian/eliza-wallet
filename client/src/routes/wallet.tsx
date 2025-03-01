import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useWalletTransactions } from "@/components/WalletTransactions";
import Chat from "@/components/chat";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface Transaction {
    hash: string;
    value: string;
    from: string;
    to: string;
    direction: "sent" | "received";
    blockNum: string;
}

interface Asset {
    name: string;
    value: number;
    color: string;
}

export default function Wallet() {
    const transactionsQuery = useWalletTransactions();
    const agentsQuery = useQuery({
        queryKey: ["agents"],
        queryFn: () => apiClient.getAgents(),
        refetchInterval: 5_000,
    });

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

    const firstAgent = agentsQuery?.data?.agents?.[0];
    const [activeView, setActiveView] = useState<"transactions" | "assets">("assets");
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [displayedAsset, setDisplayedAsset] = useState<"ETH" | "USDC">("ETH");
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const assetData: Asset[] = balanceQuery.isSuccess
        ? [
              { name: "ETH", value: parseFloat(balanceQuery.data), color: "#3b82f6" },
              { name: "USDC", value: 0.5, color: "#22c55e" },
          ]
        : [{ name: "ETH", value: 0, color: "#3b82f6" }];

    const ethBalance = balanceQuery.isSuccess ? parseFloat(balanceQuery.data) : 0;
    const ethPrice = priceQuery.isSuccess ? priceQuery.data : 0;
    const usdValue = ethBalance * ethPrice;

    useEffect(() => {
        if (activeView === "assets" && canvasRef.current && balanceQuery.isSuccess) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            const scale = window.devicePixelRatio || 1;
            canvas.width = 240 * scale;
            canvas.height = 240 * scale;
            canvas.style.width = "240px";
            canvas.style.height = "240px";
            ctx.scale(scale, scale);

            const totalValue = assetData.reduce((sum, item) => sum + item.value, 0);
            const centerX = 120;
            const centerY = 120;
            const outerRadius = 90;
            const innerRadius = 80;
            let startAngle = -Math.PI / 2;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            assetData.forEach((item) => {
                const sliceAngle = totalValue > 0 ? (item.value / totalValue) * 2 * Math.PI : 2 * Math.PI;
                const endAngle = startAngle + sliceAngle;

                const gradient = ctx.createLinearGradient(centerX - outerRadius, centerY, centerX + outerRadius, centerY);
                if (item.name === "ETH") {
                    gradient.addColorStop(0, "#3b82f6");
                    gradient.addColorStop(1, "#1e40af");
                } else if (item.name === "USDC") {
                    gradient.addColorStop(0, "#22c55e");
                    gradient.addColorStop(1, "#15803d");
                }

                ctx.beginPath();
                ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
                ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
                ctx.closePath();

                ctx.fillStyle = gradient;
                ctx.fill();

                startAngle = endAngle;
            });

            ctx.fillStyle = "#fff";
            ctx.font = "16px sans-serif";
            ctx.textAlign = "center";
            const ethPercentage = totalValue > 0 ? ((assetData[0].value / totalValue) * 100).toFixed(0) : 0;
            const usdcPercentage = totalValue > 0 ? ((assetData[1].value / totalValue) * 100).toFixed(0) : 0;
            const displayedPercentage = displayedAsset === "ETH" ? ethPercentage : usdcPercentage;
            ctx.fillText(`${displayedPercentage}% ${displayedAsset}`, centerX, centerY);
        }
    }, [activeView, balanceQuery.isSuccess, balanceQuery.data, displayedAsset]);

    const handleCanvasClick = () => {
        setDisplayedAsset((prev) => (prev === "ETH" ? "USDC" : "ETH"));
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.style.cursor = "pointer";
            canvas.addEventListener("click", handleCanvasClick);
            return () => canvas.removeEventListener("click", handleCanvasClick);
        }
    }, []);

    const handleSend = () => console.log("Send button clicked");
    const handleReceive = () => console.log("Receive button clicked");

    return (
        <div className="min-h-screen w-full flex items-center justify-center p-6 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700">
            <div className="w-[420px] h-[720px] bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 shadow-2xl flex flex-col overflow-hidden transform transition-transform duration-300">
                {/* Wallet Balance - Top Section */}
                <div className="p-6 pb-4 border-b border-gray-700/50 bg-gradient-to-r from-gray-800/50 to-gray-900/50">
                    <h2 className="text-2xl font-bold text-white bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">GM Wallet</h2>
                    {balanceQuery.isLoading || priceQuery.isLoading ? (
                        <p className="text-gray-400 text-sm mt-2 animate-pulse">Loading balance...</p>
                    ) : balanceQuery.isError || priceQuery.isError ? (
                        <p className="text-red-400 text-sm mt-2">Error loading balance</p>
                    ) : (
                        <div className="text-center mt-3">
                            <p className="text-4xl font-extrabold text-white drop-shadow-md">${usdValue.toFixed(2)}</p>
                            <p className="text-sm text-gray-300 mt-1">{ethBalance.toFixed(3)} ETH</p>
                        </div>
                    )}
                </div>

                {/* Toggle Buttons */}
                <div className="flex gap-3 px-6 py-4">
                    <Button
                        variant={activeView === "assets" ? "default" : "outline"}
                        onClick={() => setActiveView("assets")}
                        className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all duration-300 bg-gradient-to-r ${
                            activeView === "assets"
                                ? "from-gray-500 to-gray-600 text-white shadow-lg active:from-gray-600 active:to-gray-700"
                                : "from-gray-800/50 to-gray-800/50 text-gray-300 border-gray-600 hover:from-gray-700 hover:to-gray-700 active:from-gray-700 active:to-gray-700"
                        }`}
                    >
                        Assets
                    </Button>
                    <Button
                        variant={activeView === "transactions" ? "default" : "outline"}
                        onClick={() => setActiveView("transactions")}
                        className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all duration-300 bg-gradient-to-r ${
                            activeView === "transactions"
                                ? "from-gray-500 to-gray-600 text-white shadow-lg active:from-gray-600 active:to-gray-700"
                                : "from-gray-800/50 to-gray-800/50 text-gray-300 border-gray-600 hover:from-gray-700 hover:to-gray-700 active:from-gray-700 active:to-gray-700"
                        }`}
                    >
                        Transactions
                    </Button>
                </div>

                {/* Content Section */}
                <div className="flex-1 overflow-y-auto px-6">
                    {activeView === "assets" ? (
                        <div className="flex flex-col items-center justify-center h-full">
                            {balanceQuery.isLoading ? (
                                <p className="text-gray-400 text-sm animate-pulse">Loading assets...</p>
                            ) : balanceQuery.isError ? (
                                <p className="text-red-400 text-sm">Error: {balanceQuery.error?.message}</p>
                            ) : (
                                <div className="p-4 bg-gray-800/50 rounded-full shadow-inner border border-gray-700/50">
                                    <canvas ref={canvasRef} className="text-white" />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div>
                            <h3 className="text-lg font-semibold text-white mb-3">Transactions</h3>
                            {transactionsQuery.isLoading ? (
                                <div className="flex justify-center items-center h-full">
                                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-400" />
                                </div>
                            ) : transactionsQuery.isError ? (
                                <p className="text-red-400 text-sm">Error: {transactionsQuery.error?.message}</p>
                            ) : transactionsQuery.data?.length === 0 ? (
                                <p className="text-gray-400 text-sm">No transactions found.</p>
                            ) : (
                                <div className="space-y-4">
                                    {transactionsQuery.data!.map((tx: Transaction) => {
                                        const value = tx.value;
                                        const direction = tx.direction === "sent" ? "Sent" : "Received";
                                        return (
                                            <div
                                                key={tx.hash}
                                                className="p-4 rounded-xl bg-gradient-to-r from-gray-800/70 to-gray-700/70 border border-gray-600/50 shadow-md hover:shadow-xl hover:bg-gray-700/90 transition-all duration-300"
                                            >
                                                <div className="flex justify-between items-center">
                                                    <span className="text-white font-semibold capitalize text-sm">{direction}</span>
                                                    <span className="text-green-400 font-bold text-sm">{value} ETH</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Action Buttons - Bottom Section */}
                <div className="border-t border-gray-700/50 p-6 flex gap-3 bg-gray-900/80">
                    <Button
                        onClick={handleSend}
                        className="flex-1 py-3 text-sm font-semibold rounded-xl bg-gradient-to-r from-gray-500 to-gray-600 text-white hover:from-blue-600 hover:to-blue-700 transition-all duration-300 shadow-md"
                    >
                        Send
                    </Button>
                    <Button
                        onClick={handleReceive}
                        className="flex-1 py-3 text-sm font-semibold rounded-xl bg-gradient-to-r from-gray-500 to-gray-600 text-white hover:from-green-600 hover:to-green-700 transition-all duration-300 shadow-md"
                    >
                        Receive
                    </Button>
                    <Button
                        onClick={() => setIsChatOpen(true)}
                        className="flex-1 py-3 text-sm font-semibold rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700 transition-all duration-300 shadow-md"
                    >
                        Chat
                    </Button>
                </div>

                {/* Chat Modal */}
                {isChatOpen && (
                    <div className="absolute inset-0 bg-gray-900/90 backdrop-blur-md rounded-2xl border border-gray-700/50 p-6 flex flex-col shadow-2xl">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-white bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">Chat</h3>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsChatOpen(false)}
                                className="text-gray-300 hover:text-white hover:bg-gray-700/50 rounded-full transition-all duration-200"
                            >
                                <X className="h-5 w-5" />
                            </Button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {firstAgent ? (
                                <Chat agentId={firstAgent.id} />
                            ) : (
                                <p className="text-gray-400 text-sm animate-pulse">Loading chat...</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}