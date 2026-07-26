import PropTypes from 'prop-types';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

/** Dense table for operator screens; scrolls horizontally on small viewports. */
export function Table({ columns, rows, rowKey = (row) => row.id, empty }) {
  if (!rows?.length) return empty ?? null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'px-4 py-2.5 text-left text-xs font-semibold uppercase',
                  'tracking-wider text-muted',
                  column.align === 'right' && 'text-right',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-line/70 last:border-0 hover:bg-paper"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn('px-4 py-3', column.align === 'right' && 'text-right')}
                >
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

Table.propTypes = {
  columns: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      header: PropTypes.node,
      render: PropTypes.func,
      align: PropTypes.string,
    }),
  ).isRequired,
  rows: PropTypes.array,
  rowKey: PropTypes.func,
  empty: PropTypes.node,
};

export function Pagination({ meta, onPageChange }) {
  if (!meta || meta.total_pages <= 1) return null;
  const { page, total_pages: totalPages, total } = meta;

  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3">
      <p className="text-xs text-muted">
        Page {page} of {totalPages} · {total} total
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

Pagination.propTypes = {
  meta: PropTypes.shape({
    page: PropTypes.number,
    total_pages: PropTypes.number,
    total: PropTypes.number,
  }),
  onPageChange: PropTypes.func.isRequired,
};
