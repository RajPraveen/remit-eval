// One account's instructions: edit and save a draft, run it, make it current once its run passes,
// and see every saved version.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Flex, Form, Input, Select, Table } from 'antd';
import type { AccountInstructions, InstructionsVersion } from '../../../shared/types';
import { api } from '../shared/api';
import { formatTime, label, StatusTag } from '../shared/format';
import { accountOptions } from './utils';

function lastRun(v: InstructionsVersion) {
  if (!v.last_run) return 'none';
  return (
    <span>
      <Link to={`/runs/${v.last_run.id}`}>Run {v.last_run.id}</Link>{' '}
      {v.last_run.gate ? <StatusTag label={label(v.last_run.gate)} /> : <StatusTag label="Running" />}
    </span>
  );
}

const historyColumns = [
  { title: 'Version', dataIndex: 'version', key: 'version' },
  {
    title: 'Status',
    key: 'status',
    render: (_: unknown, v: InstructionsVersion) => <StatusTag label={label(v.status)} />,
  },
  { title: 'Saved', key: 'saved', render: (_: unknown, v: InstructionsVersion) => formatTime(v.created_at) },
  { title: 'Last run', key: 'last_run', render: (_: unknown, v: InstructionsVersion) => lastRun(v) },
];

export default function AccountInstructionsCard() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<string[]>([]);
  const [account, setAccount] = useState<string | null>(null);
  const [data, setData] = useState<AccountInstructions | null>(null);
  const [readerText, setReaderText] = useState('');
  const [orchestratorText, setOrchestratorText] = useState('');

  useEffect(() => {
    api.accounts().then((a) => {
      setAccounts(a);
      if (a.length) setAccount(a[0]);
    }, () => undefined);
  }, []);

  // The text boxes edit the draft when there is one, else start from the current version.
  const show = (d: AccountInstructions) => {
    setData(d);
    const v = d.draft ?? d.current;
    setReaderText(v.reader_text);
    setOrchestratorText(v.orchestrator_text);
  };

  useEffect(() => {
    if (account) api.instructions(account).then(show, () => undefined);
  }, [account]);

  const save = () => {
    if (!account) return;
    const body = { reader_text: readerText, orchestrator_text: orchestratorText };
    api.saveInstructions(account, body).then(show, () => undefined);
  };
  const runDraft = () => {
    if (!account) return;
    const openRun = ({ id }: { id: number }) => navigate(`/runs/${id}`);
    api.startRun({ scope: account, use_draft: true }).then(openRun, () => undefined);
  };
  const makeCurrent = () => {
    if (account) api.makeCurrent(account).then(show, () => undefined);
  };

  const draftPassed = data?.draft?.last_run?.gate === 'pass';

  return (
    <Card title="Account instructions">
      <Form layout="vertical">
        <Form.Item label="Account">
          <Select
            style={{ width: 200 }}
            value={account}
            onChange={setAccount}
            options={accountOptions(accounts)}
          />
        </Form.Item>
        <Form.Item label="Reading a document">
          <Input.TextArea rows={5} value={readerText} onChange={(e) => setReaderText(e.target.value)} />
        </Form.Item>
        <Form.Item label="Choosing and combining parts">
          <Input.TextArea
            rows={5}
            value={orchestratorText}
            onChange={(e) => setOrchestratorText(e.target.value)}
          />
        </Form.Item>
      </Form>
      <Flex gap={8} style={{ marginBottom: 16 }}>
        <Button onClick={save} disabled={!account}>
          Save draft
        </Button>
        <Button onClick={runDraft} disabled={!data?.draft}>
          Run this draft
        </Button>
        <Button type="primary" onClick={makeCurrent} disabled={!draftPassed}>
          Make current
        </Button>
      </Flex>
      <Table
        size="small"
        pagination={false}
        rowKey="id"
        dataSource={data?.history ?? []}
        columns={historyColumns}
      />
    </Card>
  );
}
