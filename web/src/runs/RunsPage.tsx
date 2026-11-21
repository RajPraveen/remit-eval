// The list of runs, and the form to run the golden set.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Flex, Input, Select, Table } from 'antd';
import type { RunSummary } from '../../../shared/types';
import { api } from '../shared/api';
import {
  formatScope,
  formatTally,
  formatText,
  formatTime,
  formatValue,
  label,
  RunGateTags,
} from '../shared/format';
import { usePoll } from '../shared/usePoll';
import { scopeOptions } from './utils';

function changedFromBaseline(run: RunSummary) {
  if (run.changed.length === 0) return 'none';
  return run.changed.map((c) => (
    <div key={c.path}>
      {c.path}: {formatValue(c.before)} → {formatValue(c.after)}
    </div>
  ));
}

const columns = [
  {
    title: 'Run',
    key: 'run',
    render: (_: unknown, r: RunSummary) => (
      <Link to={`/runs/${r.id}`} style={{ whiteSpace: 'nowrap' }}>
        Run {r.id}
      </Link>
    ),
  },
  { title: 'Started', key: 'started', render: (_: unknown, r: RunSummary) => formatTime(r.started_at) },
  { title: 'Scope', key: 'scope', render: (_: unknown, r: RunSummary) => formatScope(r.scope) },
  { title: 'By', key: 'by', render: (_: unknown, r: RunSummary) => label(r.started_by) },
  { title: 'Note', key: 'note', render: (_: unknown, r: RunSummary) => formatText(r.note) },
  {
    title: 'Changed from baseline',
    key: 'changed',
    render: (_: unknown, r: RunSummary) => changedFromBaseline(r),
  },
  {
    title: 'Records right',
    key: 'right',
    render: (_: unknown, r: RunSummary) => formatTally(r.records_right),
  },
  { title: 'Gate', key: 'gate', render: (_: unknown, r: RunSummary) => <RunGateTags run={r} /> },
  {
    title: 'Compare',
    key: 'compare',
    render: (_: unknown, r: RunSummary) =>
      r.compared_to !== null && <Link to={`/compare?base=${r.compared_to}&run=${r.id}`}>Compare</Link>,
  },
];

export default function RunsPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<string[]>([]);
  const [scope, setScope] = useState('all');
  const [note, setNote] = useState('');
  const [starting, setStarting] = useState(false);
  const { data: runs } = usePoll(api.runs, (rs) => rs.some((r) => r.status === 'running'), []);

  useEffect(() => {
    api.accounts().then(setAccounts, () => undefined);
  }, []);

  const start = async () => {
    setStarting(true);
    try {
      const { id } = await api.startRun({ scope, note: note || undefined });
      navigate(`/runs/${id}`);
    } catch {
      setStarting(false);
    }
  };

  return (
    <Flex vertical gap={16}>
      <Card>
        <Flex gap={12} align="center">
          <Select
            style={{ width: 200 }}
            value={scope}
            onChange={setScope}
            options={scopeOptions(accounts)}
          />
          <Input
            style={{ flex: 1 }}
            placeholder="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button type="primary" loading={starting} onClick={start}>
            Run golden set
          </Button>
        </Flex>
      </Card>
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={runs ?? []}
          loading={runs === null}
          pagination={false}
        />
      </Card>
    </Flex>
  );
}
