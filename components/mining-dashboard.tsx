"use client";

import { useState, useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Lock,
  Wallet,
  Settings,
  Zap,
  AlertCircle,
  Loader2,
  History,
  CheckCircle,
  XCircle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getWalletBalances,
  getKeypairFromPrivateKey,
  getMinerInfo,
  mine,
  getMineInfo,
} from "@/lib/sui-client";
import { useToast } from "@/hooks/use-toast";
import { cancelSchedule, schedule } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

interface DeploymentHistoryItem {
  id: string;
  timestamp: Date;
  status: "success" | "failed";
  txDigest?: string;
  suiPerBlock: string;
  blockPerRound: string;
  numberOfRounds: string;
  totalSui: string;
  error?: string;
}
export interface RoundDetail {
  id: string | number;
  endInMs: number;
  startInMs: number;
  motherlode: string;
  luckyBlock: number;
  luckyCumulative: string;
}

export interface BlockItem {
  id: number;
  myDeployed: number;
  totalDeployed: number;
  totalMiner: number;
  myCumulativeEnd: number;
  myCumulativeStart: number;
}

export interface RoundData {
  roundDetail: RoundDetail;
  blocks: BlockItem[];
}

export function MiningDashboard() {
  const { toast } = useToast();
  const [privateKey, setPrivateKey] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [balances, setBalances] = useState({
    sui: "0",
    aur: "0",
    aurInWallet: "0",
    refinedAur: "0",
  });
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);

  const [claimSui, setClaimSui] = useState(true);
  const [suiPerBlock, setSuiPerBlock] = useState("0.001");
  const [blockPerRound, setBlockPerRound] = useState("12");
  const [numberOfRounds, setNumberOfRounds] = useState("1000");
  const [thresholdMotherlode, setThresholdMotherlode] = useState("150");
  const [thresholdTotalDeploy, setThresholdTotalDeploy] = useState("2");
  const [motherlodeStrategy, setMotherlodeStrategy] = useState("none");
  const [deployStrategy, setDeployStrategy] = useState("none");
  const [deployStatus, setDeployStatus] = useState<
    "idle" | "deploying" | "cancelled" | "done"
  >("idle");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [roundDetails, setRoundDetails] = useState<RoundData>();
  const [roundsRemaining, setRoundsRemaining] = useState(0);
  const [deploymentHistory, setDeploymentHistory] = useState<
    DeploymentHistoryItem[]
  >([]);

  useEffect(() => {
    if (privateKey.length >= 64) {
      loadWalletData();
    }
  }, [privateKey]);

  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [deployStatus, countdown]);

  useEffect(() => {
    const roundInfoInterval = setInterval(async () => {
      const data = await getMineInfo();
      setRoundDetails({
        roundDetail: {
          id: data.current_round_id,
          endInMs: Number(data.ended_round_at_ms),
          startInMs: Number(data.start_round_at_ms),
          motherlode: data.motherlode,
          luckyBlock: Number(data.lucky_block_id),
          luckyCumulative: data.lucky_cumulative ?? "",
        },
        blocks: data.blocks.map((item) => {
          return {
            id: Number(item.id),
            myDeployed: Number(item.my_deployed),
            totalDeployed: Number(item.total_deployed),
            totalMiner: Number(item.total_miner),
            myCumulativeEnd: Number(item.my_cumulative_end),
            myCumulativeStart: Number(item.my_cumulative_start),
          };
        }),
      });
      if (privateKey.length >= 64) {
        await loadWalletDataRaw();
      }
    }, 3000);

    return () => {
      clearInterval(roundInfoInterval);
    };
  }, []);

  useEffect(() => {
    if (roundDetails) {
      const deployStatusCriteria = deployStatus === "deploying";

      if (deployStatusCriteria) {
        let timeCountDown = Math.floor(
          (roundDetails!.roundDetail.endInMs - Date.now() - 15 * 1000) / 1000
        );
        setCountdown(timeCountDown > 0 ? timeCountDown : 0);
      }

      cancelSchedule();
      const startDeployTime = roundDetails.roundDetail.endInMs - 15 * 1000;

      schedule(startDeployTime, async () => {
        const motherlode = BigInt(roundDetails.roundDetail.motherlode);
        const totalDeploy = roundDetails.blocks.reduce(
          (acc, current) => acc + BigInt(current.totalDeployed),
          BigInt(0)
        );

        const thresholdMotherlodeCriteria =
          motherlodeStrategy == "none" ||
          (motherlodeStrategy == "higher" &&
            motherlode >= BigInt(Number(thresholdMotherlode) * 1e9)) ||
          (motherlodeStrategy == "lower" &&
            motherlode <= BigInt(Number(thresholdMotherlode) * 1e9));
        const thresholdTotalDeployCriteria =
          deployStrategy == "none" ||
          (deployStrategy == "higher" &&
            totalDeploy >= BigInt(Number(thresholdTotalDeploy) * 1e9)) ||
          (deployStrategy == "lower" &&
            totalDeploy <= BigInt(Number(thresholdTotalDeploy) * 1e9));

        const roundThreadHold = roundsRemaining > 0;

        if (
          deployStatus === "deploying" &&
          roundThreadHold &&
          thresholdMotherlodeCriteria &&
          thresholdTotalDeployCriteria
        ) {
          setRoundsRemaining((prev) => prev - 1);

          const totalSuiDecimal =
            BigInt(Number(suiPerBlock) * 1e9) * BigInt(blockPerRound);
          let blockSelected = [];
          for (let i = 1; i <= Number(blockPerRound); i++) {
            blockSelected.push(i);
          }
          const result = await mine({
            privateKey,
            amountPerBlock: BigInt(Number(suiPerBlock) * 1e9),
            amountDecimal: totalSuiDecimal,
            blockSelected: blockSelected,
            claimSui: claimSui && Number(balances.sui) > 0,
          });

          const newHistoryItem: DeploymentHistoryItem = {
            id: roundDetails.roundDetail.id.toString(),
            timestamp: new Date(),
            status: "success",
            txDigest: result.digest,
            suiPerBlock,
            blockPerRound,
            numberOfRounds,
            totalSui: calculateRequireDeposit(),
          };
          setDeploymentHistory((prev) => [newHistoryItem, ...prev]);
        }
      });
    }

    return () => {
      cancelSchedule();
    };
  }, [JSON.stringify(roundDetails?.roundDetail)]);

  const loadWalletDataRaw = async () => {
    const keypair = getKeypairFromPrivateKey(privateKey);
    const address = keypair.toSuiAddress();
    setWalletAddress(address);

    const walletBalances = await getWalletBalances(address, "mainnet");
    const minerInfo = await getMinerInfo(address, "mainnet");

    // Convert from MIST to SUI (1 SUI = 1,000,000,000 MIST)
    setBalances({
      sui: (Number(walletBalances.sui) / 1e9).toFixed(4),
      aurInWallet: (Number(walletBalances.aur) / 1e9).toFixed(4),
      aur: (Number(minerInfo.aur) / 1e9).toFixed(4),
      refinedAur: (Number(minerInfo.refined) / 1e9).toFixed(4),
    });
  };

  const loadWalletData = async () => {
    if (!privateKey) {
      toast({
        title: "Error",
        description: "Please enter your private key",
        variant: "destructive",
      });
      return;
    }
    await loadWalletDataRaw();

    setIsLoadingBalances(true);
    try {
      toast({
        title: "Wallet Connected",
        description: `Address: ${walletAddress.slice(
          0,
          6
        )}...${walletAddress.slice(-4)}`,
      });
    } catch (error) {
      console.error("[v0] Error loading wallet:", error);
      toast({
        title: "Error",
        description: "Failed to load wallet data. Check your private key.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingBalances(false);
    }
  };

  const calculateRequireDeposit = () => {
    const total =
      Number.parseFloat(suiPerBlock) * Number.parseFloat(blockPerRound);
    return isNaN(total) ? "0" : total.toFixed(3);
  };

  const handleDeploy = async () => {
    if (!privateKey) {
      toast({
        title: "Error",
        description: "Please enter your private key",
        variant: "destructive",
      });
      return;
    }

    if (deployStatus === "idle") {
      setRoundsRemaining(Number(numberOfRounds));
      setRoundDetails(undefined);
      setCountdown(0);
      setDeployStatus("deploying");
    } else {
      cancelSchedule();
      setRoundDetails(undefined);
      setDeployStatus("idle");
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20 border border-primary/30">
            <Zap className="h-6 w-6 text-primary matrix-glow" />
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight matrix-glow">
              MINING CONTROL PANEL
            </h1>
            <p className="text-muted-foreground text-sm">
              Configure and deploy your mining strategy
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Rounds Remaining
            </p>
            <p className="text-4xl font-bold font-mono text-primary matrix-glow">
              {roundsRemaining}
            </p>
          </div>
        </div>
      </div>

      {/* Wallet Balances */}
      <Card className="border-primary/30 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Wallet className="h-5 w-5" />
            WALLET BALANCES
            {isLoadingBalances && <Loader2 className="h-4 w-4 animate-spin" />}
          </CardTitle>
          <CardDescription>
            {walletAddress
              ? `Address: ${walletAddress.slice(0, 10)}...${walletAddress.slice(
                  -8
                )}`
              : "Current token balances in your wallet"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1 p-3 rounded border border-primary/20 bg-background/50">
              <p className="text-xs text-muted-foreground">SUI in wallet</p>
              <p className="text-2xl font-bold font-mono text-primary">
                {balances.sui}
              </p>
            </div>
            <div className="space-y-1 p-3 rounded border border-primary/20 bg-background/50">
              <p className="text-xs text-muted-foreground">AUR in wallet</p>
              <p className="text-2xl font-bold font-mono text-primary">
                {balances.aurInWallet}
              </p>
            </div>{" "}
            <div className="space-y-1 p-3 rounded border border-primary/20 bg-background/50">
              <p className="text-xs text-muted-foreground">AUR Mining</p>
              <p className="text-2xl font-bold font-mono text-primary">
                {balances.aur}
              </p>
            </div>
            <div className="space-y-1 p-3 rounded border border-primary/20 bg-background/50">
              <p className="text-xs text-muted-foreground">Refined AUR</p>
              <p className="text-2xl font-bold font-mono text-primary">
                {balances.refinedAur}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Private Key Input */}
      <Card className="border-primary/30 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Lock className="h-5 w-5" />
            INPUT PRIVATE KEY
          </CardTitle>
          <CardDescription>
            Enter your private key to access mining features
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="private-key" className="text-foreground">
                Private Key
              </Label>
              <Input
                id="private-key"
                type="password"
                placeholder="Enter your private key (with or without 0x prefix)"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                className="font-mono bg-input border-primary/30 focus:border-primary"
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Your private key is never stored or transmitted to any server
              </p>
            </div>
            <Button
              onClick={loadWalletData}
              disabled={!privateKey || isLoadingBalances}
              className="w-full border border-primary/30"
            >
              {isLoadingBalances ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                "Load Wallet Data"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Strategy Configuration */}
      <Card className="border-primary/30 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Settings className="h-5 w-5" />
            STRATEGY
          </CardTitle>
          <CardDescription>
            Configure your mining parameters and deployment strategy
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            {/* Mining Parameters Grid */}
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border border-primary/20 bg-background/30 space-y-2">
                <Label
                  htmlFor="sui-per-block"
                  className="text-xs text-muted-foreground uppercase tracking-wide"
                >
                  SUI per block
                </Label>
                <Input
                  id="sui-per-block"
                  type="number"
                  step="0.001"
                  value={suiPerBlock}
                  onChange={(e) => setSuiPerBlock(e.target.value)}
                  className="font-mono text-lg font-bold bg-input border-primary/30 focus:border-primary h-12"
                />
              </div>

              <div className="p-4 rounded-lg border border-primary/20 bg-background/30 space-y-2">
                <Label
                  htmlFor="block-per-round"
                  className="text-xs text-muted-foreground uppercase tracking-wide"
                >
                  Block per round
                </Label>
                <Input
                  id="block-per-round"
                  type="number"
                  value={blockPerRound}
                  onChange={(e) => setBlockPerRound(e.target.value)}
                  className="font-mono text-lg font-bold bg-input border-primary/30 focus:border-primary h-12"
                />
              </div>

              <div className="p-4 rounded-lg border border-primary/20 bg-background/30 space-y-2">
                <Label
                  htmlFor="number-of-rounds"
                  className="text-xs text-muted-foreground uppercase tracking-wide"
                >
                  Number of round
                </Label>
                <Input
                  id="number-of-rounds"
                  type="number"
                  value={numberOfRounds}
                  onChange={(e) => setNumberOfRounds(e.target.value)}
                  className="font-mono text-lg font-bold bg-input border-primary/30 focus:border-primary h-12"
                />
              </div>
            </div>

            <div className="p-4 rounded-lg border-2 border-primary/40 bg-primary/5 space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                Total SUI Needed Per Round
                <Badge
                  variant="outline"
                  className="border-primary/50 text-primary"
                >
                  Auto-calculated
                </Badge>
              </Label>
              <div className="flex items-baseline gap-3">
                <div className="text-3xl font-bold font-mono text-primary matrix-glow">
                  {calculateRequireDeposit()}
                </div>
                <div className="text-sm text-muted-foreground font-mono">
                  SUI ({suiPerBlock} × {blockPerRound} )
                </div>
              </div>
            </div>
          </div>

          <Separator className="bg-primary/20" />

          <div className="space-y-4">
            {/* Threshold Motherlode */}
            <div className="p-4 rounded-lg border border-primary/20 bg-background/20 space-y-3">
              <Label className="text-sm font-semibold text-primary uppercase tracking-wide">
                Threshold Motherlode
              </Label>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    id="threshold-motherlode"
                    type="number"
                    value={thresholdMotherlode}
                    onChange={(e) => setThresholdMotherlode(e.target.value)}
                    className="font-mono text-base bg-input border-primary/30 focus:border-primary h-11"
                    placeholder="Value"
                  />
                </div>
                <div className="flex-1">
                  <Select
                    value={motherlodeStrategy}
                    onValueChange={setMotherlodeStrategy}
                  >
                    <SelectTrigger className="font-mono bg-input border-primary/30 focus:border-primary h-11">
                      <SelectValue placeholder="Strategy" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-primary/30">
                      <SelectItem value="none" className="font-mono">
                        None
                      </SelectItem>
                      <SelectItem value="higher" className="font-mono">
                        Mine when higher
                      </SelectItem>
                      <SelectItem value="lower" className="font-mono">
                        Mine when lower
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Threshold Total Deploy */}
            <div className="p-4 rounded-lg border border-primary/20 bg-background/20 space-y-3">
              <Label className="text-sm font-semibold text-primary uppercase tracking-wide">
                Threshold Total Deploy
              </Label>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    id="threshold-deploy"
                    type="number"
                    value={thresholdTotalDeploy}
                    onChange={(e) => setThresholdTotalDeploy(e.target.value)}
                    className="font-mono text-base bg-input border-primary/30 focus:border-primary h-11"
                    placeholder="Value"
                  />
                </div>
                <div className="flex-1">
                  <Select
                    value={deployStrategy}
                    onValueChange={setDeployStrategy}
                  >
                    <SelectTrigger className="font-mono bg-input border-primary/30 focus:border-primary h-11">
                      <SelectValue placeholder="Strategy" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-primary/30">
                      <SelectItem value="none" className="font-mono">
                        None
                      </SelectItem>
                      <SelectItem value="higher" className="font-mono">
                        Mine when higher
                      </SelectItem>
                      <SelectItem value="lower" className="font-mono">
                        Mine when lower
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-lg border border-primary/20 bg-background/20">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label
                    htmlFor="claim-sui"
                    className="text-sm font-semibold text-primary uppercase tracking-wide cursor-pointer"
                  >
                    Claim SUI
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically claim SUI rewards during mining
                  </p>
                </div>
                <Switch
                  id="claim-sui"
                  checked={claimSui}
                  onCheckedChange={setClaimSui}
                  className="border-primary/30 data-[state=unchecked]:bg-primary/10"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-center py-2">
        {deployStatus === "deploying" && countdown !== null ? (
          <div className="flex items-center justify-center gap-3">
            {countdown > 0 && (
              <>
                <div className="text-2xl font-bold font-mono text-primary matrix-glow animate-pulse">
                  {countdown}s
                </div>
                <div className="text-sm text-muted-foreground">
                  remaining until deployment
                </div>
              </>
            )}
            {countdown == 0 && (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                <div className="text-sm text-muted-foreground">
                  Waiting for result
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            Deploy 15s before endround
          </div>
        )}
      </div>
      {/* Deploy Button */}
      <Button
        size="lg"
        className="w-full h-14 text-base font-bold tracking-wider matrix-glow border border-primary/50"
        onClick={handleDeploy}
        disabled={!privateKey}
      >
        {deployStatus === "idle" && "DEPLOY"}
        {deployStatus === "deploying" && "STOP"}
      </Button>

      {deploymentHistory.length > 0 && (
        <Card className="border-primary/30 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <History className="h-5 w-5" />
              DEPLOYMENT HISTORY
            </CardTitle>
            <CardDescription>
              Recent mining deployment transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {deploymentHistory.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-lg border border-primary/20 bg-background/30 hover:bg-background/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      {item.status === "success" ? (
                        <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant={
                              item.status === "success"
                                ? "default"
                                : "destructive"
                            }
                            className="font-mono text-xs"
                          >
                            {item.status.toUpperCase()}
                          </Badge>
                          <span className="text-xs text-muted-foreground font-mono">
                            {item.timestamp.toLocaleString()}
                          </span>
                        </div>
                        {item.txDigest && (
                          <div className="text-sm font-mono text-primary break-all">
                            TX: {item.txDigest.slice(0, 16)}...
                            {item.txDigest.slice(-8)}
                          </div>
                        )}
                        {item.error && (
                          <div className="text-sm text-red-500 break-words">
                            {item.error}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right space-y-1 flex-shrink-0">
                      <div className="text-xs text-muted-foreground">
                        Total SUI
                      </div>
                      <div className="text-lg font-bold font-mono text-primary">
                        {item.totalSui}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {item.suiPerBlock} × {item.blockPerRound} ×{" "}
                        {item.numberOfRounds}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
