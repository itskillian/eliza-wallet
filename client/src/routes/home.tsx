import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { useWalletTransactions } from "@/components/WalletTransactions";
import Chat from "@/components/chat";
import { useState, useEffect, useRef } from "react"; // Added useRef and useEffect
import { Wallet } from "lucide-react";
import { Link } from "react-router-dom";

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

export default function Home() {
    const [activeView, setActiveView] = useState<"transactions" | "assets">("transactions");
    const [displayedAsset, setDisplayedAsset] = useState<"ETH" | "USDC">("ETH"); // Added for toggling ETH/USDC
    const canvasRef = useRef<HTMLCanvasElement>(null); // Added for canvas reference
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

    // Define asset data (same as Wallet)
    const assetData: Asset[] = balanceQuery.isSuccess
        ? [
              { name: "ETH", value: parseFloat(balanceQuery.data), color: "#3b82f6" },
              { name: "USDC", value: 0.5, color: "#22c55e" }, // Static USDC value as in Wallet
          ]
        : [{ name: "ETH", value: 0, color: "#3b82f6" }];

    // Canvas rendering logic (copied from Wallet)
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
            const outerRadius = 100;
            const innerRadius = 60;
            let startAngle = -Math.PI / 2;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            assetData.forEach((item) => {
                const sliceAngle = totalValue > 0 ? (item.value / totalValue) * 2 * Math.PI : 2 * Math.PI;
                const paddingAngle = 0.03;
                const endAngle = startAngle + sliceAngle - paddingAngle;

                const gradient = ctx.createLinearGradient(centerX - outerRadius, centerY, centerX + outerRadius, centerY);
                if (item.name === "ETH") {
                  
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

                startAngle = endAngle + paddingAngle;
            });

            ctx.clearRect(centerX - 50, centerY - 20, 100, 40);
            ctx.fillStyle = "#111827";
            ctx.font = "bold 16px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            const assetValue = displayedAsset === "ETH" ? usdValue : 0; // USDC value is static, no USD conversion yet
            const formattedValue = `$${assetValue.toFixed(2)}`;
            ctx.fillText(formattedValue, centerX, centerY);
        }
    }, [activeView, balanceQuery.isSuccess, balanceQuery.data, displayedAsset]);

    // Handle canvas click to toggle between ETH and USDC
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

    return (
        <div className="min-h-screen w-full p-6 bg-gray-50">
            <div className="flex gap-6 h-[calc(100vh-48px)] max-w-7xl mx-auto">
                {/* Left Side Container */}
                <div className="w-1/3 flex flex-col gap-6">

                    {/* Wallet Balance Section */}
                    <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold text-gray-900 bg-gradient-to-r from-indigo-500 to-blue-500 bg-clip-text text-transparent">
                                GM Wallet
                            </h2>
                            <Link to="/">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors duration-200"
                                >
                                    <Wallet className="h-4 w-4 text-gray-600" />
                                </Button>
                            </Link>
                        </div>
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
                                                        <span className="text-gray-900 font-medium capitalize text-sm">
                                                            {direction}
                                                        </span>
                                                        <span 
                                                            className={`font-semibold text-sm ${
                                                                direction === "Sent" 
                                                                    ? "text-rose-700" 
                                                                    : "text-green-600"
                                                            }`}
                                                        >
                                                            {value} ETH
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )
                            ) : (
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