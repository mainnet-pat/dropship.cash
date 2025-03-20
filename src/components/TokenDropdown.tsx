"use client"

import { Check, ChevronsUpDown } from "lucide-react"

import { addMissingBCMRs, cn, getTokenImage, getTokenName } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useCallback, useEffect, useState } from "react"

export function TokenDropdown({categories, balancesByToken, onSelect, allowCustom}: {categories?: string[], balancesByToken?: Record<string, number>, onSelect(value: string): void, allowCustom?: boolean}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [command, setCommand] = useState("");

  const [tokenNames, setTokenNames] = useState<Record<string, string>>({});
  const [tokenImages, setTokenImages] = useState<Record<string, string>>({});
  const [customTokenInfo, setCustomTokenInfo] = useState<{ticker: string, name: string, imageUrl: string}>();

  useEffect(() => {
    if (categories && balancesByToken) {
      setTokenNames(categories.reduce((acc, category) => {
        acc[category] = getTokenName(category);
        return acc;
      }, {} as Record<string, string>));
      setTokenImages(categories.reduce((acc, category) => {
        acc[category] = getTokenImage(category);
        return acc;
      }, {} as Record<string, string>));
    }
  }, [categories, balancesByToken]);

  const onCommandValueChange = useCallback(async (value: string) => {
    setCustomTokenInfo(undefined);

    if (value.length === 64) {
      addMissingBCMRs([value]).then(() => {
        setCustomTokenInfo({
          ticker: getTokenName(value),
          name: getTokenName(value),
          imageUrl: getTokenImage(value),
        });
      });
    }
    setCommand(value);
  }, []);

  const onCustomTokenSelect = useCallback(async (value: string) => {
    setOpen(false);
    onSelect?.(value);
  }, [onSelect]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {(!value && !customTokenInfo) && "Select token..."}
          {value && !customTokenInfo && <div className="flex flex-row gap-2 items-center">
            <div>
              <img className="rounded-full" src={tokenImages[value]} width={24} height={24} />
            </div>
            <div>
              {tokenNames[value]}
            </div>
          </div>}
          {customTokenInfo && <div className="flex flex-row gap-2 items-center">
            <div>
              <img className="rounded-full" src={customTokenInfo.imageUrl} width={24} height={24} />
            </div>
            <div>
              {customTokenInfo.name}
            </div>
          </div>}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput value={command} onValueChange={onCommandValueChange} placeholder="Search tokens..." className="h-9" />
          <CommandList>
            <CommandEmpty>
              {!customTokenInfo && <div>
                No tokens found{allowCustom ? ". You can paste tokenId" : ""}
              </div>}
              {allowCustom && customTokenInfo?.name && <div className="m-2">
                <div className="flex flex-row gap-2 items-center">
                  <div>
                    <img className="rounded-full" src={customTokenInfo.imageUrl} width={32} height={32} />
                  </div>
                  <div>
                    {customTokenInfo.name}
                  </div>
                </div>
                <div>
                  <Button variant="default" className="mt-2" onClick={() => onCustomTokenSelect(command)}>Accept</Button>
                </div>
              </div>}
            </CommandEmpty>
            <CommandGroup>
              {categories?.map((category) => (
                <CommandItem
                  key={category}
                  value={category}
                  keywords={[tokenNames[category]]}
                  onSelect={(currentValue) => {
                    setValue(currentValue)
                    onSelect(currentValue)
                    setCustomTokenInfo(undefined)
                    setOpen(false)
                  }}
                >
                  <div className="flex flex-row gap-2 items-center">
                    <div>
                      <img className="rounded-full" src={tokenImages[category]} width={32} height={32} />
                    </div>
                    <div>
                      {tokenNames[category]}
                    </div>
                  </div>
                  <Check
                    className={cn(
                      "ml-auto",
                      value === category ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
