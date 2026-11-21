// The agent's steps in tree order; clicking a step shows its detail and usage in the card below.
import { useState } from 'react';
import { Card, Table } from 'antd';
import type { RecordDetail, Step } from '../../../shared/types';
import { label, StatusTag } from '../shared/format';
import JsonViewer from '../shared/JsonViewer';
import { orderSteps, stepDetail, stepJson, type StepRow } from './utils';

const columns = [
  { title: '#', key: 'number', width: 44, render: (_: unknown, r: StepRow) => r.number },
  {
    title: 'Agent',
    key: 'agent',
    width: 104,
    render: (_: unknown, r: StepRow) => (r.depth === 0 ? 'Orchestrator' : 'Reader'),
  },
  { title: 'Turn', key: 'turn', width: 48, render: (_: unknown, r: StepRow) => r.step.turn },
  { title: 'Kind', key: 'kind', width: 84, render: (_: unknown, r: StepRow) => label(r.step.kind) },
  {
    title: 'Detail',
    key: 'detail',
    render: (_: unknown, r: StepRow) => <span style={{ wordBreak: 'break-word' }}>{stepDetail(r.step)}</span>,
  },
  {
    title: 'Outcome',
    key: 'outcome',
    width: 84,
    render: (_: unknown, r: StepRow) => <StatusTag label={label(r.step.outcome)} />,
  },
];

interface Props {
  steps: Step[];
  answer: RecordDetail['answer'];
}

export default function StepsCard({ steps, answer }: Props) {
  const rows = orderSteps(steps);
  // The page remounts this card for each record, so the first step is selected on every record.
  const [selected, setSelected] = useState<number | null>(rows.length ? rows[0].step.id : null);

  const selectedRow = rows.find((r) => r.step.id === selected) ?? null;

  return (
    <>
      <Card title="Steps">
        <Table
          size="small"
          pagination={false}
          rowKey={(r) => r.step.id}
          dataSource={rows}
          onRow={(r) => ({ onClick: () => setSelected(r.step.id), style: { cursor: 'pointer' } })}
          rowClassName={(r) => (r.step.id === selected ? 'ant-table-row-selected' : '')}
          columns={columns}
        />
      </Card>
      {selectedRow && (
        <Card title={`Step ${selectedRow.number}`}>
          <JsonViewer data={stepJson(selectedRow.step, answer)} />
        </Card>
      )}
    </>
  );
}
