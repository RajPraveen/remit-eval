// Boundary eval for one record: the payment values, then each invoice row, expected against returned.
import { useState } from 'react';
import { Button, Card, Table } from 'antd';
import type { BoundaryDetails } from '../../../shared/types';
import { StatusTag } from '../shared/format';
import { hiddenRowCount, invoiceRows, paymentRows, type BoundaryRow } from './utils';

const resultColumn = {
  title: 'Result',
  key: 'result',
  render: (_: unknown, r: BoundaryRow) => <StatusTag label={r.result} />,
};

const paymentColumns = [
  { title: 'Payment', dataIndex: 'value', key: 'value', width: '26%' },
  { title: 'Expected', dataIndex: 'expected', key: 'expected', width: '27%' },
  { title: 'Returned', dataIndex: 'returned', key: 'returned', width: '27%' },
  resultColumn,
];

const invoiceColumns = [
  { title: 'Invoice reference', dataIndex: 'value', key: 'value', width: '26%' },
  { title: 'Expected amount', dataIndex: 'expected', key: 'expected', width: '27%' },
  { title: 'Returned amount', dataIndex: 'returned', key: 'returned', width: '27%' },
  resultColumn,
];

export default function BoundaryEvalCard({ details }: { details: BoundaryDetails | null }) {
  const [showAll, setShowAll] = useState(false);

  const payment = details ? paymentRows(details) : [];
  const invoices = details ? invoiceRows(details) : [];
  const hidden = hiddenRowCount(invoices, showAll);
  const visibleInvoices = hidden ? invoices.slice(0, invoices.length - hidden) : invoices;

  return (
    <Card title="Boundary eval">
      <Table
        size="small"
        pagination={false}
        dataSource={payment}
        style={{ marginBottom: 16 }}
        columns={paymentColumns}
      />
      <Table size="small" pagination={false} dataSource={visibleInvoices} columns={invoiceColumns} />
      {hidden > 0 && (
        <Button style={{ marginTop: 8 }} onClick={() => setShowAll(true)}>
          Show {hidden} more
        </Button>
      )}
    </Card>
  );
}
