"use client";

import { AirdropTable, defaultData, Payment } from "@/components/AirdropTable";
import { TokenDropdown } from "@/components/TokenDropdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConnectorContext } from "@/contexts/ConnectorContext";
import { useWatchAddress } from "@/hooks/useWatchAddress";
import { addMissingBCMRs, fetchFtTokenHolders, fetchNftTokenHolders, getTokenDecimals, getTokenImage, getTokenLabel, getTokenName } from "@/lib/utils";
import { ChangeEvent, Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";
import { decodeCashAddress } from "@bitauth/libauth";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BCMR, Registry } from "mainnet-js";
import { ScrollArea } from "@/components/ui/scroll-area";

const BCHCategory = "0000000000000000000000000000000000000000000000000000000000000000";
const BCHBcmr: Registry = {
  "$schema": "https://cashtokens.org/bcmr-v2.schema.json",
  "version": {
      "major": 0,
      "minor": 1,
      "patch": 0
  },
  "latestRevision": "2023-06-23T12:45:07.755Z",
  "registryIdentity": {
      "name": "bcmr for BCH",
      "description": "self-published bcmr for BCH"
  },
  "identities": {
      "0000000000000000000000000000000000000000000000000000000000000000": {
          "2023-06-23T12:45:07.755Z": {
              "name": "BCH",
              "description": "BitcoinCash",
              "token": {
                  "category": "0000000000000000000000000000000000000000000000000000000000000000",
                  "symbol": "BCH",
                  "decimals": 8
              },
              "uris": {
                  "icon": "https://minisatoshi.cash/images/Resources/Branding/9-bitcoin-cash-circle.svg"
              }
          }
      }
  }
};

export default function Home() {
  const { connect, address, disconnect } = useConnectorContext();
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
      let splitParticipants = data.length - data.filter((payment) => payment.amount === 0).length;

      const splitPayout = Math.max(0, Number(
        ((Math.floor(totalPayout / splitParticipants * 10**decimals))/10**decimals).toFixed(decimals)
      ));

      if (splitParticipants < 1000e-8 && sourceCategory === BCHCategory) {
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
    if (typeof result === "string") {
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

    let tokenHolders = await fetchFtTokenHolders(targetCategory);
    if (!includeContracts) {
      tokenHolders = tokenHolders.filter((holder) => holder.address.includes(":p") === false);
    }
    setData((prev) => [...prev, ...tokenHolders.map((holder, index) => ({ id: (data.length + index).toString(), amount: holder.amount, payout: 0, address: holder.address }))]);
  }, [targetCategory, includeContracts, data]);

  const onLoadNftHoldersFromChaingraphClick = useCallback(async () => {
    if (!targetCategory) {
      return;
    }

    let tokenHolders = await fetchNftTokenHolders(targetCategory);
    if (!includeContracts) {
      tokenHolders = tokenHolders.filter((holder) => holder.address.includes(":p") === false);
    }
    setData((prev) => [...prev, ...tokenHolders.map((holder, index) => ({ id: (data.length + index).toString(), amount: holder.amount, payout: 0, address: holder.address }))]);
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

  const onStartAirdropClick = useCallback(() => {
    if (fullValidationError) {
      return;
    }

  }, [fullValidationError]);

  return (
    <div>
      <div className="flex m-5 flex-col items-end">
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
              BCH AirDrop Tool
            </CardHeader>
            <CardContent className="flex-col">
              <p>Send BCH and tokens to multiple recipients</p>
              <p>Connect your wallet to start airdrop configuration</p>
            </CardContent>
          </Card>
        </div>
      }
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
                    <Button onClick={() => onLoadFtHoldersFromChaingraphClick()}>
                      Get FT holders
                    </Button>

                    <Button onClick={() => onLoadNftHoldersFromChaingraphClick()}>
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
                <Button disabled={!!fullValidationError} className="bg-[#0AC18E] hover:bg-[#1AD19E] text-lg" size={"lg"} variant={"default"} onClick={() => onStartAirdropClick}>Start airdrop!</Button>
              </div>
              {fullValidationError && <div className="text-red-400">{fullValidationError}</div>}
            </>}
          </CardContent>
        </Card>
      </div>}
      {connectedAddress && targetCategory &&
        <div className="mx-10 mt-5">
          <div className="flex flex-row gap-2">
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

          {data.length > 0 &&
            <AirdropTable data={data} setData={setDataWithValidation} sourceCategory={sourceCategory} targetCategory={targetCategory} onRecalcPayoutClick={onRecalcPayoutClick} />
          }
        </div>}
    </div>
  );
}
