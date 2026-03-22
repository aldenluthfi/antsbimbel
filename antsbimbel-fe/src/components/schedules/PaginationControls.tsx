import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  total: number
  pageSize: number
  onPageChange: (nextPage: number) => void
  onPageSizeChange: (nextPageSize: number) => void
}) {
  const pageSizeOptions = [10, 25, 50, 100]
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <p className="text-muted-foreground">
          Page {page} / {totalPages} ({total} records)
        </p>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Rows</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="h-8 w-24 justify-start font-normal">
                {pageSize}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Rows</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={String(pageSize)} onValueChange={(next) => onPageSizeChange(Number(next))}>
                {pageSizeOptions.map((option) => (
                  <DropdownMenuRadioItem key={option} value={String(option)}>
                    {option}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          className="flex-1 sm:flex-none"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          className="flex-1 sm:flex-none"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
