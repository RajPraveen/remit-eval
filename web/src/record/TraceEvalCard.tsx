// Trace eval for one record: each check's outcome, grouped by the agent it judged.
import { Card, Table } from 'antd';
import { label, StatusTag } from '../shared/format';
import { agentName, agentRowSpan, checkLabel, type TraceCheck } from './utils';

export default function TraceEvalCard({ trace }: { trace: TraceCheck[] }) {
  const columns = [
    {
      title: 'Agent',
      key: 'agent',
      onCell: (_: unknown, index?: number) => ({
        rowSpan: agentRowSpan(trace, index ?? 0),
        style: { verticalAlign: 'top' as const },
      }),
      render: (_: unknown, t: TraceCheck) => agentName(t),
    },
    {
      title: 'Check',
      key: 'check',
      render: (_: unknown, t: TraceCheck) => (
        <span style={{ whiteSpace: 'nowrap' }}>{checkLabel(t.name)}</span>
      ),
    },
    {
      title: 'Outcome',
      key: 'outcome',
      render: (_: unknown, t: TraceCheck) => <StatusTag label={label(t.outcome)} />,
    },
    { title: 'Details', key: 'details', render: (_: unknown, t: TraceCheck) => t.details.summary },
  ];

  return (
    <Card title="Trace eval">
      <Table size="small" pagination={false} rowKey="id" dataSource={trace} columns={columns} />
    </Card>
  );
}
