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
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowUpDown, ChevronDown, MoreHorizontal, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const defaultData: Payment[] = [
  {
    id: "m5gr84i9",
    amount: 316,
    address: "bitcoincash:qzwfk507kmrs76gd2zefp3fer766r4v7cqw5td5s9c",
  },
  {
    id: "3u1reuv4",
    amount: 242,
    address: "Abe45@example.com",
  },
  {
    id: "derv1ws0",
    amount: 837,
    address: "Monserrat44@example.com",
  },
  {
    id: "5kma53ae",
    amount: 874,
    address: "Silas22@example.com",
  },
  {
    id: "bhqecj4p",
    amount: 721,
    address: "carmella@example.com",
  },
]

export type Payment = {
  id: string
  amount: number
  address: string
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
          Cashaddress
          <ArrowUpDown />
        </Button>
      )
    },
    cell: ({ row }) => <div className="lowercase font-mono">{row.getValue("address")}</div>,
  },
  {
    accessorKey: "amount",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Amount
          <ArrowUpDown />
        </Button>
      )
    },
    cell: ({ row, column, table }) => {
      const initialValue = row.getValue<number>("amount")
      const [value, setValue] = React.useState(initialValue)
      React.useEffect(() => {
        setValue(initialValue)
      }, [initialValue])
      const onBlur = () => {
        (table.options.meta as any)?.updateData(row.index, column.id, value)
      }
      return (
        <Input
          className="text-right font-medium text-sm"
          value={value}
          onChange={e => setValue(Number(e.target.value))}
          onBlur={onBlur}
        />
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

export function AirdropTable({data, setData} : {data: Payment[], setData: React.Dispatch<React.SetStateAction<Payment[]>>}) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})

  const table = useReactTable({
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
    },
  })

  return (
    <div className="w-full">
      <div className="flex items-center py-4">
        <Input
          placeholder="Filter data..."
          value={(table.getColumn("address")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("address")?.setFilterValue(event.target.value)
          }
          className="max-w-sm"
        />
        <Button variant="outline" className="ml-auto" onClick={() => setData([])}>
          Clear
        </Button>
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
