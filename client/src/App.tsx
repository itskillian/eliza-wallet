import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "./components/ui/tooltip";
import { Toaster } from "./components/ui/toaster";
import { BrowserRouter, Route, Routes } from "react-router";
import Wallet from "./routes/wallet";
import Home from "./routes/home";
import useVersion from "./hooks/use-version";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: Number.POSITIVE_INFINITY,
        },
    },
});

function App() {
    useVersion();
    return (
        <QueryClientProvider client={queryClient}>
            <div
                className="bg-gradient-to-br from-gray-100 to-gray-200"
                style={{
                    colorScheme: "dark",
                }}>
                <BrowserRouter>
                    <TooltipProvider delayDuration={0}>
                        <div className="flex flex-1 flex-col gap-4 size-full container">
                            <Routes>
                                <Route path="/" element={<Home />} />
                                <Route path="/wallet" element={<Wallet />} />   
                            </Routes>
                        </div>
                        <Toaster />
                    </TooltipProvider>
                </BrowserRouter>
            </div>
        </QueryClientProvider>
    );
}

export default App;
