"use client"

import * as React from "react"
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowUpDown, Lock, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getTokenDecimals, getTokenLabel, MaxPayoutsInTx } from "@/lib/utils"

export const defaultData: Payment[] = [
  // {
  //   id: "m5gr84i9",
  //   amount: 0,
  //   address: "bitcoincash:qzwfk507kmrs76gd2zefp3fer766r4v7cqw5td5s9c",
  //   payout: 316,
  // },
]

export type Payment = {
  id: string
  amount: number
  address: string
  payout: number
}

export const columns: ColumnDef<Payment>[] = [
  {
    accessorKey: "address",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Address
          <ArrowUpDown />
        </Button>
      )
    },
    cell: ({ row }) => <div className="lowercase font-mono overflow-hidden text-xs md:text-sm flex flex-row w-[125px] md:w-[240px] lg:w-auto">
      <div className="hidden lg:block">{row.getValue<string>("address").split(":")[0]}:</div>
      <div>{row.getValue<string>("address").split(":")[1]}</div>
    </div>,
  },
  {
    accessorKey: "amount",
    header: ({ column, table }) => {
      return (
        <div className="flex flex-col items-end">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            <span className="hidden md:block"># FT/NFT</span>
            {(table.options.meta as any)?.targetCategoryTicker}
            <ArrowUpDown />
          </Button>
        </div>
      )
    },
    cell: ({ row, table }) => <div className="text-right font-medium font-mono text-xs md:text-sm">{row.getValue<number>("amount").toLocaleString('en-US', { minimumFractionDigits: (table.options.meta as any)?.targetCategoryDecimals }) || ""}</div>,
  },
  {
    accessorKey: "payout",
    header: ({ column, table }) => {
      return (
        <div className="flex flex-col items-end">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            <span className="hidden md:block">Payout</span>
            {(table.options.meta as any)?.sourceCategoryTicker}
            <ArrowUpDown />
          </Button>
        </div>
      )
    },
    cell: ({ row, column, table }) => {
      const initialValue = row.getValue<number>("payout")
      const [value, setValue] = React.useState<string>(initialValue.toLocaleString('en-US', { minimumFractionDigits: (table.options.meta as any)?.sourceCategoryDecimals }));

      const onBlur = React.useCallback((e: React.FocusEvent<HTMLInputElement>) => {
        const parsed = Number(parseFloat(value.replaceAll(',', '')).toFixed((table.options.meta as any)?.sourceCategoryDecimals));
        setValue(parsed.toLocaleString('en-US', { minimumFractionDigits: (table.options.meta as any)?.sourceCategoryDecimals }));
        (table.options.meta as any)?.updateData(row.index, column.id, parsed)
      }, [value]);
      return (
        <div className="flex items-center gap-2">
          {row.getValue<number>("amount") === 0 && <Lock size={16} />}
          <Input
            className="text-right font-medium font-mono text-xs md:text-sm"
            value={value}
            onChange={e => setValue(e.target.value)}
            onBlur={onBlur}
          />
        </div>
      )
    },
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row, table }) => {
      return (
        <Button variant="outline" className="h-8 w-8 p-0" onClick={() => (table.options.meta as any)?.deleteData(row.index)}>
          <span className="sr-only">Open menu</span>
          <Trash2 />
        </Button>
      )
    },
  },
]

export function AirdropTable({data, setData, sourceCategory, targetCategory, onRecalcPayoutClick} : {data: Payment[], setData: React.Dispatch<React.SetStateAction<Payment[]>>, sourceCategory?: string, targetCategory?: string, onRecalcPayoutClick: () => void}) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const recipients = data.filter(element => element.payout > 0);

  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})

  const table = useReactTable<Payment>({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    // getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
    meta: {
      updateData: (rowIndex: number, columnId: string, value: string) => {
        setData((old) =>
          old.map((row, index) => {
            if (index === rowIndex) {
              return {
                ...old[rowIndex],
                [columnId]: value,
              };
            }
            return row;
          })
        );
      },
      deleteData: (rowIndex: number) => {
        setData((old) =>
          old.filter((_, index) => index !== rowIndex)
        );
      },
      sourceCategoryTicker: getTokenLabel(sourceCategory!),
      targetCategoryTicker: getTokenLabel(targetCategory!),
      sourceCategoryDecimals: getTokenDecimals(sourceCategory!),
      targetCategoryDecimals: getTokenDecimals(targetCategory!),
    },
  });

  return (
    <div className="w-full">
      <div className="flex items-center pt-4">
        <Input
          placeholder="Filter data..."
          value={(table.getColumn("address")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("address")?.setFilterValue(event.target.value)
          }
          className="max-w-sm"
        />
        <div className="flex ml-auto space-x-2">
          <Button variant="default" onClick={() => onRecalcPayoutClick()}>
            Recalc Payouts
          </Button>
          <Button variant="outline" onClick={() => setData([])}>
            Clear
          </Button>
        </div>
      </div>
      <div className="flex text-sm gap-2 pt-4 pb-2 items-center">
        <div>Total recipients: {recipients.length}</div>
        <div>Transactions needed: {Math.ceil(recipients.length / MaxPayoutsInTx)}</div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No data.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
