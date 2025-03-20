"use client";

import { AirdropTable, defaultData, Payment } from "@/components/AirdropTable";
import { TokenDropdown } from "@/components/TokenDropdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConnectorContext } from "@/contexts/ConnectorContext";
import { useWatchAddress } from "@/hooks/useWatchAddress";
import { addMissingBCMRs, BCHBcmr, BCHCategory, chunkArrayInGroups, fetchFtTokenHolders, fetchNftTokenHolders, getTokenDecimals, getTokenImage, getTokenLabel, getTokenName, isChipnet } from "@/lib/utils";
import { ChangeEvent, Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";
import { decodeCashAddress, decodeTransaction, hexToBin } from "@bitauth/libauth";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BCMR, SendRequest, TestNetWallet, TokenSendRequest, Wallet } from "mainnet-js";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileDown, FileUp, Github, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function Home() {
  const { connect, address, disconnect, signTransaction } = useConnectorContext();
  const [connectedAddress, setConnectedAddress] = useState<string>();
  const [categories, setCategories] = useState<string[]>();
  const { balance, utxos } = useWatchAddress(connectedAddress);
  const [balancesByToken, setBalancesByToken] = useState<Record<string, number>>({});
  const [sourceCategory, setSourceCategory] = useState<string>();
  const [targetCategory, setTargetCategory] = useState<string>();
  const [budget, setBudget] = useState<string>("0");
  const [showWallet, setShowWallet] = useState<boolean>(false);
  const [data, setData] = useState<Payment[]>(defaultData);
  const [inputAddress, setInputAddress] = useState<string>("");
  const [addressValidationError, setAddressValidationError] = useState<string>("");
  const [inputPayout, setInputPayout] = useState<string>("");
  const [payoutValidationError, setPayoutValidationError] = useState<string>("");
  const [fullValidationError, setFullValidationError] = useState<string>("");
  const [includeContracts, setIncludeContracts] = useState<boolean>(false);
  const [strategy, setStrategy] = useState<string>("Even"); // Even | Proportional
  const [showFinishTransactionModal, setShowFinishTransactionModal] = useState<boolean>(false);
  const [showDonationDialog, setShowDonationDialog] = useState<boolean>(false);
  const [finishTransactionMessage, setFinishTransactionMessage] = useState<string>("");
  const [chaingraphLoading, setChainGraphLoading] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      if (utxos) {
        BCMR.addMetadataRegistry(BCHBcmr);
        const categories = [BCHCategory, ...utxos.map((utxo) => utxo.token?.capability ? undefined : utxo.token?.tokenId).filter((tokenId) => tokenId !== undefined).filter((value, index, array) => array.indexOf(value) === index)];
        setCategories(categories);
        await addMissingBCMRs(categories);
        const balances = categories.reduce((acc, category) => {
          acc[category] = utxos.filter((utxo) => utxo.token?.tokenId === category).reduce((acc, utxo) => acc + Number(utxo.token?.amount), 0);
          return acc;
        }, {} as Record<string, number>);
        balances[BCHCategory] = utxos.reduce((acc, utxo) => acc + (utxo.token === undefined ? Number(utxo.satoshis) : 0), 0) - 10000; // BCH
        setBalancesByToken(balances);
      }
    })();
  }, [balance, utxos]);

  useEffect(() => {
    (async () => {
      if (address) {
        const addr = await address();
        setConnectedAddress(addr);
      }
    })();
  }, [address]);

  const disconnectWallet = useCallback(async () => {
    setConnectedAddress(undefined);
    setCategories(undefined);
    await disconnect();
  }, [disconnect]);

  const onBudgetValueChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setBudget(event.target.value);

    if (!sourceCategory) {
      return;
    }

    const decimals = getTokenDecimals(sourceCategory);
    const amount = Number(event.target.value) * 10**decimals;

    if (amount < 0) {
      setBudget("0");
      return;
    }

    if (amount > balancesByToken[sourceCategory]) {
      setBudget(String((balancesByToken[sourceCategory] / 10**decimals).toFixed(decimals)));
      return;
    }
  }, [sourceCategory, balancesByToken]);

  const onSourceCategoryChange = useCallback((value: string) => {
    setBudget("0");
    setSourceCategory(value);
  }, []);

  const validateData = useCallback((data: Payment[]) => {
    const available = parseFloat(budget);
    const currentTotal = data.reduce((acc, payment) => acc + payment.payout, 0);
    if (currentTotal > available) {
      setFullValidationError("Total amount exceeds budget");
    }
    return data;
  }, [budget]);

  const recalcPayouts = useCallback(() => {
    const decimals = getTokenDecimals(sourceCategory!);

    if (strategy === "Even") {
      let totalPayout = Number(budget);
      const splitParticipants = data.length - data.filter((payment) => payment.amount === 0).length;

      const splitPayout = Math.max(0, Number(
        ((Math.floor(totalPayout / splitParticipants * 10**decimals))/10**decimals).toFixed(decimals)
      ));

      if (splitPayout < 1000e-8 && sourceCategory === BCHCategory) {
        setFullValidationError("BCH Payout too low");
      }

      setData((prev) => prev.map((payment) => {
        if (payment.amount === 0) {
          totalPayout -= payment.payout;
          return payment;
        }

        return payment;
      }));

      setData((prev) => prev.map((payment) => {
        if (!payment.amount && payment.payout) {
          return payment;
        }
        const payout = splitPayout;
        return { ...payment, payout };
      }));

    } else if (strategy === "Proportional") {
      let totalPayout = Number(budget);

      setData((prev) => prev.map((payment) => {
        if (payment.amount === 0) {
          totalPayout -= payment.payout;
          return payment;
        }

        return payment;
      }));

      const totalAmount = data.reduce((acc, payment) => acc + payment.amount, 0);
      const totalPayoutPerToken = Math.max(0, totalPayout / totalAmount);

      setData((prev) => prev.map((payment) => {
        if (!payment.amount && payment.payout) {
          return payment;
        }
        const payout = Number((payment.amount * totalPayoutPerToken).toFixed(decimals));
        return { ...payment, payout: payout < 1000e-8 ? 0 : payout };
      }));
    }

    return data;
  }, [budget, data, strategy, sourceCategory]);

  const onTargetCategoryChange = useCallback((value: string) => {
    setTargetCategory(value);
    const recalced = recalcPayouts();
    validateData(recalced);
  }, [recalcPayouts, validateData]);

  const onMaxClick = useCallback(() => {
    if (!sourceCategory) {
      return;
    }

    const decimals = getTokenDecimals(sourceCategory);
    setBudget(String((balancesByToken[sourceCategory] / 10**decimals).toFixed(decimals)));
  }, [sourceCategory, balancesByToken]);

  const onAddressChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setInputAddress(event.target.value);

    const result = decodeCashAddress(event.target.value);
    if (typeof result === "string" || (isChipnet && result.prefix === "bitcoincash" || !isChipnet && result.prefix === "bchtest")) {
      setAddressValidationError("Invalid address");
      return;
    }

    setAddressValidationError("");
  }, []);

  const onPayoutChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setInputPayout(event.target.value);

    const value = parseFloat(event.target.value);

    if (isNaN(value)) {
      setPayoutValidationError("Invalid amount");
      return;
    }

    if (value < 0) {
      setPayoutValidationError("Amount must be positive");
      return;
    }

    const available = parseFloat(budget);
    const currentTotal = data.reduce((acc, payment) => acc + payment.payout, 0);
    if (currentTotal + value > available) {
      setPayoutValidationError("Amount exceeds budget");
      return;
    }

    setPayoutValidationError("");
  }, [budget, data]);

  const onAddButtonClick = useCallback(() => {
    setData((prev) => [{ id: data.length.toString(), amount: 0, payout: parseFloat(inputPayout), address: inputAddress }, ...prev]);
    setInputAddress("");
    setInputPayout("");
    setAddressValidationError("");
    setPayoutValidationError("");
  }, [inputAddress, inputPayout, data]);

  const setDataWithValidation: Dispatch<SetStateAction<Payment[]>> = useCallback((value) => {
    setFullValidationError("");

    if (typeof value === "function") {
      setData((prev) => {
        return validateData(value(prev));
      });
    } else {
      setData(validateData(value));
    }
  }, [validateData]);

  const onLoadFtHoldersFromChaingraphClick = useCallback(async () => {
    if (!targetCategory) {
      return;
    }

    setChainGraphLoading(true);
    let tokenHolders = await fetchFtTokenHolders(targetCategory);
    if (!includeContracts) {
      tokenHolders = tokenHolders.filter((holder) => holder.address.includes(":p") === false);
    }

    const newData = tokenHolders
      .map((holder, index) => ({ id: (data.length + index).toString(), amount: holder.amount, payout: 0, address: holder.address }))
      .filter((payment) => {
        if (data.find((existing) => existing.address === payment.address && existing.amount === payment.amount)) {
          return false;
        }
        return true;
      });

    setData((prev) => [...prev, ...newData]);
    setChainGraphLoading(false);
  }, [targetCategory, includeContracts, data]);

  const onLoadNftHoldersFromChaingraphClick = useCallback(async () => {
    if (!targetCategory) {
      return;
    }

    setChainGraphLoading(true);
    let tokenHolders = await fetchNftTokenHolders(targetCategory);
    if (!includeContracts) {
      tokenHolders = tokenHolders.filter((holder) => holder.address.includes(":p") === false);
    }

    const newData = tokenHolders
      .map((holder, index) => ({ id: (data.length + index).toString(), amount: holder.amount, payout: 0, address: holder.address }))
      .filter((payment) => {
        if (data.find((existing) => existing.address === payment.address && existing.amount === payment.amount)) {
          return false;
        }
        return true;
      });

    setData((prev) => [...prev, ...newData]);
    setChainGraphLoading(false);
  }, [targetCategory, includeContracts, data]);

  const onStrategyChange = useCallback((value: string) => {
    setStrategy(value);
    const recalced = recalcPayouts();
    validateData(recalced);
  }, [recalcPayouts, validateData]);

  const onRecalcPayoutClick = useCallback(() => {
    const recalced = recalcPayouts();
    validateData(recalced);
  }, [recalcPayouts, validateData]);

  const onStartAirdropClick = useCallback(async() => {
    if (fullValidationError) {
      console.log(1);
      return;
    }

    const sendRequests: (SendRequest | TokenSendRequest)[] = [];
    data.forEach((payment) => {
      if (payment.payout === 0) {
        return;
      }

      if (sourceCategory === BCHCategory) {
        sendRequests.push({
          cashaddr: payment.address,
          value: payment.payout,
          unit: "bch",
        });
      } else {
        sendRequests.push(new TokenSendRequest({
          cashaddr: payment.address,
          value: 1000,
          tokenId: sourceCategory!,
          amount: payment.payout,
        }));
      }
    });

    const MaxPayoutsInTx = 1;
    const chunks = chunkArrayInGroups(sendRequests, MaxPayoutsInTx);

    for (const [index, chunk] of chunks.entries()) {
      const WalletType = isChipnet ? TestNetWallet : Wallet;
      const wallet = await WalletType.watchOnly(connectedAddress!);
      const { unsignedTransaction, sourceOutputs } = await wallet.send(chunk, {
        buildUnsigned: true,
      });

      const encodedTransaction = hexToBin(unsignedTransaction!);
      const decoded = decodeTransaction(encodedTransaction);
      setShowFinishTransactionModal(true);
      setFinishTransactionMessage(chunks.length > 1 ? `Sign transaction ${index+1}/${chunks.length} to airdrop tokens` : `Sign transaction to airdrop tokens`);
      const signResult = await signTransaction({
        transaction: decoded,
        sourceOutputs: sourceOutputs!,
        broadcast: false,
        userPrompt: chunks.length > 1 ? `Sign transaction ${index+1}/${chunks.length} to airdrop tokens` : `Sign transaction to airdrop tokens`
      });
      setFinishTransactionMessage("");
      setShowFinishTransactionModal(false);

      if (signResult === undefined) {
        toast.error("User rejected the transaction signing request", { duration: 10000 });
        return;
      }

      try {
        const response = await wallet.submitTransaction(hexToBin(signResult.signedTransaction), true);
        toast.success(`Successfully airdropped tokens. TxId: ${response}`, { duration: 10000 });
      } catch (e) {
        toast.error((e as any).message || e, { duration: 10000 });
        return;
      }
    }
  }, [fullValidationError, connectedAddress, data, signTransaction, sourceCategory]);

  const exportToCsv = useCallback(() => {
    const csv = data.map(row => `${row.address},${row.amount},${row.payout}`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "airdrop.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const importFromCsv = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) {
        return;
      }
      const text = await file.text();
      const rows = text.split("\n").map(row => row.split(","));
      const newData = rows.map(([address, amount, payout], index) => ({
        id: index.toString(),
        address,
        amount: Number(amount),
        payout: Number(payout),
      }));
      setData((prev) => [...prev, ...newData]);
    };
    input.click();
  }, [setData]);

  return (
    <div>
      <div className="flex m-5 flex-col items-end">
        {isChipnet && <div className="flex text-red-500 w-full justify-center">This is a testnet version</div>}
        {!connectedAddress && <Button onClick={() => connect("WalletConnectV2")}>Connect Wallet</Button>}
        {connectedAddress && <Button onClick={disconnectWallet}>Disconnect Wallet</Button>}
        {connectedAddress && <p>Connected Address: {connectedAddress}</p>}
        {connectedAddress && balance && <p>Balance: {balance/1e8} BCH</p>}
        {categories && <p className="underline decoration-dashed" onClick={() => setShowWallet(!showWallet)}>Assets: {categories.length}</p>}
        {showWallet && <ScrollArea className="h-72 rounded-md border p-3">
          <div className="flex flex-col">
            {categories?.map((category) => (
              <div key={category} className="mt-3 text-sm">
                <div className="flex flex-row gap-2">
                  <img className="rounded-full" src={getTokenImage(category)} width={48} height={48}  />
                  <div className="flex flex-col">
                    <div>{getTokenName(category)}</div>
                    <div className="flex flex-col gap">
                      <div className="flex flex-row gap-3">
                        <div>{(balancesByToken[category] / (10**getTokenDecimals(category))).toFixed(getTokenDecimals(category))}</div>
                        <div>${getTokenLabel(category)}</div>
                      </div>
                      {/* <div>{category.slice(0, 10)}...</div> */}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            </div>
          </ScrollArea>
        }
      </div>
      {!connectedAddress &&
        <div className="flex">
          <Card className="w-[450px] mx-auto">
            <CardHeader className="font-semibold text-2xl">
            <div className="flex flex-col items-center">
              <div>
                <img src="/logo.svg" />
              </div>
              <div className="mt-5 text-[rgb(87,188,151)]">
                BCH AirDrop Tool
              </div>
            </div>
            </CardHeader>
            <CardContent className="flex-col text-center">
              <p>Send BCH and CashTokens to multiple recipients</p>
              <p>Connect your wallet to start airdrop configuration</p>
            </CardContent>
          </Card>
        </div>
      }
      {connectedAddress && <div className="flex flex-col items-center mb-5">
        <img className="max-h-[100px]" src="/logo.svg" />
      </div>}
      {connectedAddress && utxos && <div className="flex">
        <Card className="w-[350px] mx-auto">
          <CardHeader className="font-semibold text-2xl">
            Airdrop configuration
          </CardHeader>
          <CardContent className="flex-col">
            <Label htmlFor="sourceToken" className="mb-1">Asset to disperse</Label>
            <TokenDropdown categories={categories} balancesByToken={balancesByToken} onSelect={onSourceCategoryChange} />

            {sourceCategory &&
            <>
              <div className="flex flex-row gap-1 mt-1">
                <div>{(balancesByToken[sourceCategory] / (10**getTokenDecimals(sourceCategory))).toFixed(getTokenDecimals(sourceCategory))}</div>
                <div>${getTokenLabel(sourceCategory)}</div>
                <div>available</div>
              </div>
              <Label htmlFor="name" className="mt-4 mb-1">Airdrop budget</Label>
              <div className="flex flex-row gap-2">
                <div className="flex flex-1">
                  <Input type="number" min="0" id="name" placeholder="0" className="" value={budget} onChange={onBudgetValueChange} />
                </div>
                <div className="flex flex-0">
                  <Button onClick={onMaxClick}>Max</Button>
                </div>
              </div>
            </>}

            {sourceCategory && <>
              <Label className="mt-4 mb-1">Token holders for aidrdop</Label>
              <TokenDropdown categories={categories?.filter(category => category !== BCHCategory)} balancesByToken={balancesByToken} onSelect={onTargetCategoryChange} allowCustom />
            </>}

            {targetCategory && <>
              <Card className="py-4 mt-4">
                <CardContent className="px-3">
                  <div className="flex items-center space-x-2">
                    <Button onClick={() => onLoadFtHoldersFromChaingraphClick()} disabled={chaingraphLoading}>
                      Get FT holders
                    </Button>

                    <Button onClick={() => onLoadNftHoldersFromChaingraphClick()} disabled={chaingraphLoading}>
                      Get NFT holders
                    </Button>
                  </div>

                  <div className="flex items-center space-x-2 mt-2">
                    <Checkbox id="includeContracts" onChange={() => setIncludeContracts(!includeContracts)} />
                    <label
                      htmlFor="includeContracts"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Include contracts in recipients
                    </label>
                  </div>
                </CardContent>
              </Card>
              <Label className="mt-4 mb-1">Select payout strategy</Label>
              <Select onValueChange={onStrategyChange} value={strategy}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select strategy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="Even">Even</SelectItem>
                    <SelectItem value="Proportional">Proportional</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <div className="flex justify-center mt-4">
                <Button disabled={!!fullValidationError || !data.length} className="bg-[#0AC18E] hover:bg-[#1AD19E] text-lg" size={"lg"} variant={"default"} onClick={onStartAirdropClick}>Start airdrop!</Button>
              </div>
              {fullValidationError && <div className="text-red-400">{fullValidationError}</div>}
            </>}
          </CardContent>
        </Card>
      </div>}
      {connectedAddress && targetCategory &&
        <div className="mx-10 mt-3">
          <hr />
          <div className="flex flex-row gap-2 mt-3">
            <div className="flex flex-col">
              <Input
                className="font-medium text-sm"
                value={inputAddress}
                onChange={onAddressChange}
                placeholder="Address"
              />
              {addressValidationError && <div className="text-red-400">{addressValidationError}</div>}
            </div>
            <div className="flex flex-col">
              <Input
                className="text-right font-medium text-sm"
                value={inputPayout}
                onChange={onPayoutChange}
                placeholder="Payout"
              />
              {payoutValidationError && <div className="text-red-400">{payoutValidationError}</div>}
            </div>
            <Button onClick={() => onAddButtonClick()} disabled={addressValidationError.length > 0 || payoutValidationError.length > 0 || inputAddress.length === 0 || inputPayout.length === 0}>
              Add Fixed Amount Payout
            </Button>
          </div>

          <div className="flex flex-row gap-2 mt-4">
            <Button title="Import From CSV" variant="outline" onClick={() => importFromCsv()}>
              <FileDown /> Import From CSV
            </Button>
            {data.length > 0 && <Button title="Export To CSV" variant="outline" onClick={() => exportToCsv()}>
              <FileUp /> Export To CSV
            </Button>}
          </div>

          {data.length > 0 &&
            <div>
              <AirdropTable data={data} setData={setDataWithValidation} sourceCategory={sourceCategory} targetCategory={targetCategory} onRecalcPayoutClick={onRecalcPayoutClick} />

              {<div className="my-5 text-sm flex flex-row justify-between w-full items-center gap-5">
                <Link href="http://github.com/mainnet-pat/dropship.cash/" className="flex flex-row gap-1 items-center">
                  <Github />
                  <div className="text-blue-400">dropship.cash</div>
                </Link>
                <div className="flex flex-col">
                  <div>Brought to you by <Link className="text-blue-400" href="https://x.com/mainnet_pat">mainnet_pat</Link>, funded by <Link className="text-blue-400" href="https://x.com/_minisatoshi">minisatoshi</Link> & <Link className="text-blue-400" href="https://t.me/@CatsupCash">CatsupCash</Link></div>
                  <div className="text-right underline decoration-dashed cursor-pointer" onClick={() => setShowDonationDialog(true)}>Consider a donation</div>
                </div>
              </div>}
            </div>
          }
        </div>}

        <Dialog open={showFinishTransactionModal} onOpenChange={(open) => setShowFinishTransactionModal(open)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Finalize the action in your wallet</DialogTitle>
              <DialogDescription>
                <span className="text-xl">
                  {finishTransactionMessage}
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center animate-spin">
              <LoaderCircle size={72} />
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showDonationDialog} onOpenChange={(open) => setShowDonationDialog(open)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Donate</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-5 max-w-[300px] mx-auto">
              <a href="bitcoincash:qqsxjha225lmnuedy6hzlgpwqn0fd77dfq73p60wwp">
                <img src="/qrcode.png" />
              </a>
            </div>
            <div className="text-center overflow-hidden text-ellipsis">pat#111222; 🎀</div>
            <div className="text-center overflow-hidden text-ellipsis">bitcoincash:qqsxjha225lmnuedy6hzlgpwqn0fd77dfq73p60wwp</div>
          </DialogContent>
        </Dialog>

        {(data.length === 0 && !showDonationDialog) && <div className="text-sm absolute bottom-5 flex flex-row justify-between w-full px-5 items-center gap-5">
          <Link href="http://github.com/mainnet-pat/dropship.cash/" className="flex flex-row gap-1 items-center">
            <Github />
            <div className="text-blue-400">dropship.cash</div>
          </Link>
          <div className="flex flex-col">
            <div>Brought to you by <Link className="text-blue-400" href="https://x.com/mainnet_pat">mainnet_pat</Link>, funded by <Link className="text-blue-400" href="https://x.com/_minisatoshi">minisatoshi</Link> & <Link className="text-blue-400" href="https://t.me/@CatsupCash">CatsupCash</Link></div>
            <div className="text-right underline decoration-dashed cursor-pointer" onClick={() => setShowDonationDialog(true)}>Consider a donation</div>
          </div>
        </div>}
    </div>
  );
}
