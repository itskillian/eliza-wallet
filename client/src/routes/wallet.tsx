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
                // Add padding angle (0.03 radians ≈ 2 degrees)
                const paddingAngle = 0.03;
                const endAngle = startAngle + sliceAngle - paddingAngle;

                const gradient = ctx.createLinearGradient(centerX - outerRadius, centerY, centerX + outerRadius, centerY);
                if (item.name === "ETH") {
                    gradient.addColorStop(0, "#60a5fa"); 
                    gradient.addColorStop(1, "#2563eb");
             
                } else if (item.name === "USDC") {
                    gradient.addColorStop(1, "#9333ea");
                }

                ctx.beginPath();
                ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
                ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
                ctx.closePath();

                ctx.fillStyle = gradient;
                ctx.fill();

                // Update startAngle to include the padding
                startAngle = endAngle + paddingAngle;
            });

            // Clear previous text
            ctx.clearRect(centerX - 50, centerY - 20, 100, 40);

            // Draw the dollar value
            ctx.fillStyle = "#111827";
            ctx.font = "bold 16px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            // Format the USD value
            const assetValue = displayedAsset === "ETH" ? usdValue : 0; // Add USDC value here if needed
            const formattedValue = `$${assetValue.toFixed(2)}`;

            // Draw the value
            ctx.fillText(formattedValue, centerX, centerY);
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
        <div className="min-h-screen w-full flex items-center justify-center p-6">
            <div className="relative w-[420px] h-[720px] bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col overflow-hidden">
                {/* Wallet Balance - Top Section */}
                <div className="p-6 pb-4 border-b border-gray-100">
                    <h2 className="text-2xl font-bold text-gray-900 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">GM Wallet</h2>
                    {balanceQuery.isLoading || priceQuery.isLoading ? (
                        <p className="text-gray-500 text-sm mt-2 animate-pulse">Loading balance...</p>
                    ) : balanceQuery.isError || priceQuery.isError ? (
                        <p className="text-red-500 text-sm mt-2">Error loading balance</p>
                    ) : (
                        <div className="text-center mt-3">
                            <p className="text-4xl font-extrabold text-gray-900 drop-shadow-md">${usdValue.toFixed(2)}</p>
                            <p className="text-sm text-gray-500 mt-1">{ethBalance.toFixed(3)} ETH</p>
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
                                ? "from-gray-200 to-gray-300 text-gray-700 shadow-md active:from-gray-300 active:to-gray-400"
                                : "from-gray-100 to-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100 hover:text-gray-700"
                        }`}
                    >
                        Assets
                    </Button>
                    <Button
                        variant={activeView === "transactions" ? "default" : "outline"}
                        onClick={() => setActiveView("transactions")}
                        className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all duration-300 bg-gradient-to-r ${
                            activeView === "transactions"
                                ? "from-gray-200 to-gray-300 text-gray-700 shadow-md active:from-gray-300 active:to-gray-400"
                                : "from-gray-100 to-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100 hover:text-gray-700"
                        }`}>
                        Transactions
                    </Button>
                </div>

                {/* Content Section */}
                <div className="flex-1 overflow-y-auto px-6">
                    {activeView === "assets" ? (
                        <div className="flex flex-col items-center justify-center h-full">
                            {balanceQuery.isLoading ? (
                                <p className="text-gray-500 text-sm animate-pulse">Loading assets...</p>
                            ) : balanceQuery.isError ? (
                                <p className="text-red-500 text-sm">Error: {balanceQuery.error?.message}</p>
                            ) : (
                                <div className="p-4 bg-gray-50 rounded-full shadow-inner border border-gray-100">
                                    <canvas ref={canvasRef} className="text-gray-900" />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-3">Transactions</h3>
                            {transactionsQuery.isLoading ? (
                                <div className="flex justify-center items-center h-full">
                                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-400" />
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
                                                    <span className="text-gray-900 font-semibold capitalize text-sm">{direction}</span>
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
                <div className="border-t border-gray-100 p-6 flex gap-3 bg-white">
                    <Button
                        onClick={handleSend}
                        className="flex-1 py-3 text-sm font-semibold rounded-xl bg-gradient-to-r from-gray-400 to-gray-500 text-white hover:from-gray-500 hover:to-gray-600 transition-all duration-300 shadow-sm"
                    >
                        Send
                    </Button>
                    <Button
                        onClick={handleReceive}
                        className="flex-1 py-3 text-sm font-semibold rounded-xl bg-gradient-to-r from-gray-400 to-gray-500 text-white hover:from-gray-500 hover:to-gray-600 transition-all duration-300 shadow-sm"
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
                    <div className="absolute top-0 left-0 w-[420px] h-[720px] bg-white rounded-3xl border border-gray-100 p-6 flex flex-col shadow-md z-10">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">Chat</h3>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsChatOpen(false)}
                                className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-all duration-200"
                            >
                                <X className="h-5 w-5" />
                            </Button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {firstAgent ? (
                                <Chat agentId={firstAgent.id} />
                            ) : (
                                <p className="text-gray-500 text-sm animate-pulse">Loading chat...</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}